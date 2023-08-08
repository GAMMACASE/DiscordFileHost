import { Strategy as JWTStrategy, VerifiedCallback } from 'passport-jwt';
import { Strategy as DiscordStrategy } from 'passport-discord';
import { RequestHandler, ErrorRequestHandler } from 'express';
import * as cookieParser from 'cookie-parser';
import busboy = require('connect-busboy');
import passport = require('passport');
import { createRoutes } from 'routes';
import express = require('express');
import * as cors from 'cors';

export class JoinableURL extends URL {
	constructor(input: string, base?: string | URL | undefined) {
		super(input, base);
	}

	join(path: string) {
		path.replaceAll('\\', '/');
		const parts = path.split('/');

		for(const part of parts) {
			if(part.length === 0 || part === '.')
				continue;

			if(part === '..') {
				const idx = this.pathname.lastIndexOf('/');
				if(idx === -1)
					continue;

				this.pathname = this.pathname.slice(0, idx);
				continue;
			}

			if(this.pathname.endsWith('/'))
				this.pathname += part;
			else
				this.pathname += `/${part}`;
		}

		return this;
	}
}

export function getHostName(req: express.Request) {
	return new JoinableURL(`${req.protocol}://${req.get('host')}/`);
}

export function getApiEndpoint(req: express.Request) {
	return getHostName(req).join(`${process.env.EXPRESS_SUBPATH!}/api`);
}

export function getFrontEndpoint(req: express.Request) {
	return getHostName(req).join(process.env.EXPRESS_SUBPATH!);
}

declare global {
    namespace Express {
		interface User {
			auth: string;
			name: string;
			avatar: string;
			section: string;
		}
	}
}

passport.use(new DiscordStrategy({
	clientID: process.env.DISCORD_CLIENT_ID!,
	clientSecret: process.env.DISCORD_CLIENT_SECRET!,
	callbackURL: `${process.env.EXPRESS_SUBPATH}/api/auth/discord/callback`,
	scope: [ 'identify' ]
}, (accessToken, refreshToken, profile, done) => {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	done(null, profile as any);
}));

passport.use(new JWTStrategy({
	secretOrKey: process.env.EXPRESS_JWT_ACCESS_SECRET,
	jwtFromRequest: (req) => {
		if(!req || !req.cookies || !req.cookies.sessdata || !req.cookies.sesssign)
			return null;

		const signParts = req.cookies.sesssign.split('.');

		if(signParts.length !== 2 || req.cookies.sessdata.includes('.'))
			return null;

		return `${signParts[0]}.${req.cookies.sessdata}.${signParts[1]}`;
	}
}, async (data: Express.User, done: VerifiedCallback) => {
	done(null, data);
}));

export const asyncFuncHandler = (fn: RequestHandler): RequestHandler => function(req, res, next) {
	return Promise.resolve(fn(req, res, next)).catch(next);
};

export async function loadExpressApp(): Promise<express.Application> {
	const app = express();

	if(process.env.EXPRESS_BEHIND_PROXY?.toLowerCase() === 'true')
		app.enable('trust proxy');

	app.set('view engine', 'ejs');
	app.set('views', './views');

	app.use(cookieParser());
	app.use(busboy({
		defParamCharset: 'utf8'
	}));

	app.use(passport.initialize());

	// app.disable('etag');
	app.disable('x-powered-by');

	/* app.use(cors({
		origin: '*'
	}));*/

	if(process.env.EXPRESS_STATIC_SERVE?.toLowerCase() === 'true')
		app.use(express.static('package'));

	app.use(await createRoutes());

	app.use(function (err, req, res, next) {
		console.error(`Route ${req.path} has errored. Error:`, err);
		res.status(500);
		res.send();
	} as ErrorRequestHandler);

	return new Promise((resolve, reject) => {
		app.listen(Number(process.env.EXPRESS_PORT) ?? 3005, process.env.EXPRESS_HOST ?? '127.0.0.1', () => {
			console.log(`Server is up on port ${process.env.EXPRESS_PORT ?? 3005}`);
			resolve(app);
		});
	});
}