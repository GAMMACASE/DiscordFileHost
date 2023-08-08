import { FileMetadata, getFileMetadata } from 'discord_client';
import { once } from 'events';
import { ChainSplitter, ChunkSplitter } from 'chunkmanager';
import { RESTPostAPIChannelMessageResult } from 'discord-api-types/v10';
import express = require('express');
import { RequestHandler } from 'express';
import globals = require('globals');
import * as crypto from 'crypto';
import { FileUpload, User } from 'database_client';
import * as https from 'https';
import * as zlib from 'zlib';
import sanitize = require('sanitize-filename');
import { asyncFuncHandler as afh, getApiEndpoint, getFrontEndpoint } from 'express_server';
import { pipeline } from 'stream';
import { deleteChunkMessages, sendChunks, storeFileMetadata } from 'discord_client';
import rateLimit from 'express-rate-limit';
import { DeferredPromise } from 'pqueue';
import * as qs from 'querystring';

/* function generateBoundary() {
	let _boundary = '--------------------------';
	for (let i = 0; i < 24; i++) {
		_boundary += Math.floor(Math.random() * 10).toString(16);
	}

	return _boundary;
} */

const uploadFiles: RequestHandler = async function (req, res, next) {
	if(!req.busboy)
		return res.sendStatus(400);
	
	const uploadProgress: Promise<{ ident: string, filename: string } | undefined>[] = [];
	req.pipe(req.busboy);
		
	req.busboy.on('file', (name, file, info) => {
		const { filename, encoding, mimeType } = info;

		const filenameSanitized = sanitize(filename, { replacement: '_' });

		if(filenameSanitized === '') {
			return;
		}

		const fileProgress = new DeferredPromise<{ ident: string, filename: string } | undefined>();
		uploadProgress.push(fileProgress);
		const msgPromises: Promise<RESTPostAPIChannelMessageResult>[] = [];
		let totalFileSize = 0;
		const chunkSequence: number[] = [];
		// const boundary = generateBoundary();

		const fileSecret = crypto.randomBytes(32);
		const fileIV = crypto.randomBytes(16);
			
		pipeline(file.on('data', (data) => { totalFileSize += data.length; }),
			zlib.createGzip(),
			crypto.createCipheriv('aes-256-ctr', fileSecret, fileIV),
			// Creates a 8mb chunks and combines them in a group of 10 chunks
			// These are mostly the discord limits per file size and files attached to a single message
			new ChunkSplitter(8 * 1024 * 1024),
			new ChainSplitter(10).on('data', (chain) => {
				if(totalFileSize === 0)
					return fileProgress.resolve(undefined);
				chunkSequence.push(chain.length);
				msgPromises.push(sendChunks(chain));
				// Streamable variant behaves poorly for big files for an unknown reason :(
				/* new ChunkSplitterStreamable((8 * 1024 * 1024), 10, boundary).on('data', (stream) => {
					msgPromises.push(sendChunksStreamable(stream, boundary)); */
			}).on('finish', () => {
				Promise.all(msgPromises).then(async (msgs) => {
					msgs = msgs.filter(x => x && x.attachments && x.attachments.length > 0);
						
					if(msgs.length === 0)
						return fileProgress.resolve(undefined);
		
					const ident = crypto.randomBytes(10).toString('hex');
		
					let error = undefined;
					for(const [ i, msg ] of msgs.entries()) {
						if(!msg || !msg.attachments)
							error = new Error('Found invalid msg after upload!');
							
						if(chunkSequence[i] !== msg.attachments.length)
							error = new Error(`Invalid number of attachments found in uploaded message! Expected ${chunkSequence[i]}, got ${msg.attachments.length}!`);
					}
		
					if(error) {
						await deleteChunkMessages(msgs.map(x => x.id));
						throw error;
					}
		
					let dbUser: User | undefined = globals.db.objectForPrimaryKey<User>('User', req.user!.section);
					if(!dbUser) {
						dbUser = globals.db.write<User>(() => {
							return globals.db.create<User>('User', {
								section: req!.user!.section,
								auth: '',
								refresh: req.cookies.refresh
							});
						});
					}
		
					const fileMeta: FileMetadata = {
						ident, filename: filenameSanitized, mimeType,
						size: totalFileSize,
						compressed: true,
						encryption: `${fileSecret.toString('hex')}.${fileIV.toString('hex')}`,
						chunks: msgs.reduce((prev, curr) => {
							prev[curr.id] = curr.attachments.length;
							return prev;
						}, {} as Record<string, number>)
					};
		
					globals.db.write(() => {
						const fileUpload = globals.db.create<FileUpload>('FileUpload', {
							ident: fileMeta.ident,
							filename: fileMeta.filename,
							mimetype: fileMeta.mimeType,
							size: fileMeta.size,
							date: new Date(),
							views: 0,
							attachments: msgs.map(x => [...x!.attachments.values()]).flat().map(x => x.url),
							messages: msgs.map(x => x!.id)
						});
		
						dbUser!.files.push(fileUpload);
					});
		
					await storeFileMetadata(msgs[0].id, fileMeta);
					console.log(`File uploaded[${fileMeta.ident}]: ${fileMeta.filename}, size: ${fileMeta.size}, mimeType: ${fileMeta.mimeType} [${req.user?.section}]`);
		
					fileProgress.resolve({
						filename: fileMeta.filename,
						ident: fileMeta.ident
					});
				}).catch(e => fileProgress.reject(e));
			}),
			(e) => { if(e) fileProgress.reject(e); }
		);
	});

	await once(req.busboy, 'close');
	Promise.all(uploadProgress).then(idents => {
		res.status(200);
		res.send(JSON.stringify({
			idents: idents!.filter(x => x)
		}));
	}).catch(next);
};

const getFiles: RequestHandler = function (req, res, next) {
	if(!req.user)
		return res.sendStatus(401);

	const user = globals.db.objectForPrimaryKey<User>('User', req.user.section);

	if(!user) {
		return res.send(JSON.stringify({
			files: []
		}));
	}

	res.send(JSON.stringify({
		files: user.files.map(x => ({
			filename: x.filename,
			ident: x.ident,
			size: x.size,
			date: x.date,
			views: x.views
		}))
	}));
};

const downloadFile: RequestHandler = async function (req, res, next) {
	if(!req.params.ident)
		return res.sendStatus(400);

	const file = globals.db.objectForPrimaryKey<FileUpload>('FileUpload', req.params.ident);

	if(!file || file.attachments.length === 0)
		return res.sendStatus(404);

	globals.db.write(() => {
		file.views++;
	});

	const metadata = await getFileMetadata(file.messages[0]);
	
	if(!metadata)
		return res.sendStatus(403);

	const [ secret, iv ] = metadata.encryption.split('.');

	if(!secret || !iv)
		return res.sendStatus(403);

	res.set({
		'Content-Disposition': `attachment; filename*=utf-8''${qs.escape(metadata.filename)}`,
		'Content-Type': metadata.mimeType,
		'Content-Length': metadata.size
	});

	const decipher = crypto.createDecipheriv('aes-256-ctr', Buffer.from(secret, 'hex'), Buffer.from(iv, 'hex'));
	const gunzip = zlib.createGunzip();
	decipher.on('error', next).pipe(gunzip).on('error', next).pipe(res);

	for(const attachment of file.attachments) {
		await new Promise((resolve, reject) => {
			https.get(attachment, (response) => {
				if(response.statusCode !== 200) {
					return reject(new Error(`Chunk download failed, response status: ${response.statusCode}`));
				}
				
				response.pipe(decipher, { end: false });
	
				response.on('end', () => {
					response.unpipe(decipher);
					resolve(undefined);
				});

				response.on('error', reject);
			}).on('error', reject);
		}).catch(next);
	}

	decipher.end();
};

const deleteFile: RequestHandler = async function (req, res, next) {
	if(!req.params.ident)
		return res.sendStatus(400);

	let messages: string[] | undefined;
	let filename: string;
	let size: number;
	globals.db.write(() => {
		const user = globals.db.objectForPrimaryKey<User>('User', req.user!.section);
		if(!user)
			return res.sendStatus(401);

		const file = user.files.find((x) => x.ident === req.params.ident);
		
		if(!file)
			return res.sendStatus(404);
		
		filename = file.filename;
		size = file.size;
		messages = [ ...file.messages ];
		globals.db.delete(file);
	});

	if(messages) {
		await deleteChunkMessages(messages).catch(next);
		console.log(`File deleted[${req.params.ident}]: ${filename!}, size: ${size!} [${req.user?.section}]`);
		res.sendStatus(200);
	}
};

const shorthandDeleteFile: RequestHandler = function (req, res, next) {
	res.redirect(getApiEndpoint(req).join(`files/${req.params.ident}`).toString());
};

const shorthandDownloadFile: RequestHandler = function (req, res, next) {
	if(!req.params.ident)
		return res.sendStatus(400);

	const file = globals.db.objectForPrimaryKey<FileUpload>('FileUpload', req.params.ident);

	if(!file || file.attachments.length === 0)
		return res.sendStatus(404);

	const fileURL = getApiEndpoint(req).join(`files/${req.params.ident}`);

	if([
		'image/jpeg',
		'image/png',
		'image/gif',
		'image/webp',
		'video/webm'
	].includes(file.mimetype)) {
		res.redirect(fileURL.toString());
	}
	// Audio content isn't supported in discord
	/* else if([
		'audio/wav'
	].includes(file.mimetype)) {
		res.render('embed_audio', {
			frontURL: getFrontEndpoint(req),
			fileURL: fileURL,
			fileName: file.filename,
			fileSize: humanFileSize(file.size, false, 2)
		});
	} */
	else if([
		'video/mp4'
	].includes(file.mimetype)) {
		res.render('embed_video', {
			frontURL: getFrontEndpoint(req),
			fileURL: fileURL,
			fileName: file.filename,
			fileSize: humanFileSize(file.size, false, 2)
		});
	}
	else {
		res.render('embed_file', {
			frontURL: getFrontEndpoint(req),
			fileURL: fileURL,
			fileName: file.filename,
			fileSize: humanFileSize(file.size, false, 2)
		});
	}
};

// https://stackoverflow.com/questions/10420352/converting-file-size-in-bytes-to-human-readable-string
function humanFileSize(bytes: number, si = false, dp = 1) {
	const thresh = si ? 1000 : 1024;
	
	if (Math.abs(bytes) < thresh)
		return bytes + ' B';
	
	const units = si 
		? ['kB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'] 
		: ['KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB'];
	let u = -1;
	const r = 10 ** dp;
	
	do {
		bytes /= thresh;
		++u;
	} while (Math.round(Math.abs(bytes) * r) / r >= thresh && u < units.length - 1);
	
	return bytes.toFixed(dp) + ' ' + units[u];
}

export function createRoute() {
	const router = express.Router();

	router.route(`${process.env.EXPRESS_SUBPATH!}/f/:ident`)
		.get(afh(shorthandDownloadFile))
		.delete(afh(shorthandDeleteFile))
		.all((req, res, next) => res.sendStatus(405));

	router.route(`${process.env.EXPRESS_SUBPATH!}/api/files`)
		.post(rateLimit({
			windowMs: 60 * 1000,
			max: 10,
			standardHeaders: true,
			legacyHeaders: false
		}), afh(uploadFiles))
		.get(afh(getFiles))
		.all((req, res, next) => res.sendStatus(405));
	
	router.route(`${process.env.EXPRESS_SUBPATH!}/api/files/:ident`)
		.get(afh(downloadFile))
		.delete(afh(deleteFile))
		.all((req, res, next) => res.sendStatus(405));

	return router;
}