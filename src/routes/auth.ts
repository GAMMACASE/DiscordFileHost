import { User } from 'database_client';
import express = require('express');
import globals = require('globals');
import passport = require('passport');
import { Strategy as DiscordStrategy } from 'passport-discord';
import * as crypto from 'crypto';
import * as jwt from 'jsonwebtoken';
import { RequestHandler } from 'express';
import { asyncFuncHandler as afh } from 'express_server';

interface RefreshToken {
	section: string;
}

function generateAndSetTokens(res: express.Response, data: Express.User) {
	const accessToken = jwt.sign(data, process.env.EXPRESS_JWT_ACCESS_SECRET!, { expiresIn: Number(process.env.EXPRESS_JWT_ACCESS_LIFETIME) });
	const tokParts = accessToken.split('.');
	res.cookie('sessdata', tokParts[1], { maxAge: Number(process.env.EXPRESS_JWT_REFRESH_LIFETIME) * 1000 });
	res.cookie('sesssign', `${tokParts[0]}.${tokParts[2]}`, { maxAge: Number(process.env.EXPRESS_JWT_REFRESH_LIFETIME) * 1000, httpOnly: true });

	const refreshToken = jwt.sign({
		section: data.section
	}, process.env.EXPRESS_JWT_REFRESH_SECRET!, { expiresIn: Number(process.env.EXPRESS_JWT_REFRESH_LIFETIME) });

	// eslint-disable-next-line no-inline-comments
	res.cookie('refresh', refreshToken, { maxAge: Number(process.env.EXPRESS_JWT_REFRESH_LIFETIME) * 1000, httpOnly: true /* secure: true, */ });

	return { accessToken, refreshToken };
}

export const jwtAuthRoute: RequestHandler = function (req, res, next) {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	passport.authenticate('jwt', { session: false }, async (err: any, user: Express.User, info: any) => {
		if(err)
			return next(err);

		if(info && info instanceof jwt.TokenExpiredError) {
			if(req.cookies && req.cookies.refresh) {
				try {
					const data = jwt.verify(req.cookies.refresh, process.env.EXPRESS_JWT_REFRESH_SECRET!) as RefreshToken;
					let userData: Express.User = JSON.parse(Buffer.from(req.cookies.sessdata, 'base64').toString());

					const dbUser = globals.db.objectForPrimaryKey<User>('User', data.section);

					if(dbUser && userData && dbUser?.section === userData?.section) {
						userData = {
							auth: userData.auth,
							name: userData.name,
							avatar: userData.avatar,
							section: userData.section
						};

						const { refreshToken } = generateAndSetTokens(res, userData);

						globals.db.write(() => {
							dbUser.refresh = refreshToken;
						});

						user = userData;
					}
				}
				catch(e) { }
			}
		}

		if(!user) {
			const anonUser: Express.User = {
				name: 'Anonymous',
				auth: '',
				avatar: '',
				section: crypto.randomBytes(10).toString('hex')
			};

			await new Promise<void>((resolve, reject) => req.logIn(anonUser, { session: false }, (error) => {
				if(error)
					return reject(error);
				
				generateAndSetTokens(res, anonUser);

				resolve();
				next();
			})).catch(next);
		}
		else {
			req.logIn(user, { session: false }, next);
		}
	})(req, res, next);
};

const discordAuthCallback: RequestHandler = function (req, res, next) {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	passport.authenticate('discord', (err: any, profile: DiscordStrategy.Profile, info: any) => {
		if(info instanceof Error || err || !profile)
			return res.redirect(process.env.EXPRESS_SUBPATH || '/');

		const resultingUser: Express.User = {
			auth: profile.id,
			name: `${profile.username}#${profile.discriminator}`,
			avatar: profile.avatar ?? '',
			section: ''
		};

		let dbUser: User = globals.db.objects<User>('User').filtered('auth == $0', [ profile.id ])[0];
		const currUser = globals.db.objectForPrimaryKey<User>('User', req?.user?.section ?? '');

		if(dbUser) {
			if(currUser && currUser.files.length !== 0) {
				globals.db.write(() => {
					for(const file of currUser!.files) {
						dbUser.files.push(file);
					}

					globals.db.delete(currUser);
				});
			}

			resultingUser.section = dbUser.section;
		}
		else if(currUser) {
			globals.db.write(() => {
				currUser!.auth = profile.id;
			});

			resultingUser.section = currUser.section;
			dbUser = currUser;
		}

		if(!resultingUser.section) {
			dbUser = globals.db.write<User>(() => globals.db.create<User>('User', {
				auth: profile.id,
				refresh: '',
				section: crypto.randomBytes(10).toString('hex')
			}));

			resultingUser.section = dbUser.section;
		}

		const { refreshToken } = generateAndSetTokens(res, resultingUser);

		globals.db.write(() => {
			dbUser.refresh = refreshToken;
		});

		res.redirect(process.env.EXPRESS_SUBPATH || '/');
	})(req, res, next);
};

export function createRoute() {
	const router = express.Router();

	router.use(afh(jwtAuthRoute));

	router.use(`${process.env.EXPRESS_SUBPATH!}/api/auth`,
		express.Router()
			.get('/logout', (req, res, next) => {
				res.clearCookie('sessdata');
				res.clearCookie('sesssign');
				res.clearCookie('refresh');
			
				res.redirect(process.env.EXPRESS_SUBPATH || '/');
			})
			.get('/discord', passport.authenticate('discord'))
			.get('/discord/callback', afh(discordAuthCallback))
	);

	return router;
}

