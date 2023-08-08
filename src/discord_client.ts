import 'dotenv/config';
import { RequestMethod, REST } from '@discordjs/rest';
import { Routes, RESTPostAPIChannelMessageResult } from 'discord-api-types/v10';
import { Readable } from 'stream';
import * as crypto from 'crypto';
import * as LRUCache from 'lru-cache';

const rest = new REST({ version: '10', timeout: 60000 }).setToken(process.env.DISCORD_CLIENT_TOKEN!);
const msgCache = new LRUCache<string, string>({ max: 1000 });

// Patching resolveRequest function to allow streaming requests
/* const originalResolveRequest = rest.requestManager['resolveRequest'];
rest.requestManager['resolveRequest'] = async function(request: InternalRequest) {
	if(!(request.body instanceof Readable))
		return originalResolveRequest.call(this, request);

	const { options } = this;
	let query = '';

	if (request.query) {
		const resolvedQuery = request.query.toString();
		if (resolvedQuery !== '') {
			query = `?${resolvedQuery}`;
		}
	}

	const headers: RequestHeaders = {
		...this.options.headers,
		'User-Agent': `${DefaultUserAgent} ${options.userAgentAppendix}`.trim(),
	};

	if (request.auth !== false) {
		if (!process.env.DISCORD_CLIENT_TOKEN) {
			throw new Error('Expected token to be set for this request, but none was present');
		}

		headers.Authorization = `${request.authPrefix ?? this.options.authPrefix} ${process.env.DISCORD_CLIENT_TOKEN}`;
	}

	if (request.reason?.length) {
		headers['X-Audit-Log-Reason'] = encodeURIComponent(request.reason);
	}

	const url = `${options.api}${request.versioned === false ? '' : `/v${options.version}`}${request.fullRoute}${query}`;

	// Required patch to pass as is stream object instead of buffering it
	const finalBody = request.body;

	const fetchOptions: RequestOptions = {
		headers: { ...request.headers, ...headers } as Record<string, string>,
		method: request.method.toUpperCase() as Dispatcher.HttpMethod,
	};

	if (finalBody !== undefined) {
		fetchOptions.body = finalBody as Exclude<RequestOptions['body'], undefined>;
	}

	fetchOptions.dispatcher = request.dispatcher ?? this.agent ?? undefined!;
	return { url, fetchOptions };
};*/
 
export type FileMetadata = {
	ident: string,
	filename: string,
	mimeType: string,
	size: number,
	compressed: boolean,
	encryption: string,
	chunks: Record<string, number>
};

function encodeMetadata(file: FileMetadata) {
	const iv = crypto.randomBytes(16);
	const cipher = crypto.createCipheriv('aes-256-ctr', process.env.METADATA_ENCRYPTION_SECRET!, iv);
	const metadata = Buffer.concat([cipher.update(JSON.stringify(file)), cipher.final()]);

	return `${iv.toString('hex')}.${metadata.toString('hex')}`;
}

function decodeMetadata(metadata: string): FileMetadata {
	const [ iv, meta ] = metadata.split('.');

	if(!iv || !meta)
		throw new Error('Invalid metadata provided');
	
	const decipher = crypto.createDecipheriv('aes-256-ctr', process.env.METADATA_ENCRYPTION_SECRET!, Buffer.from(iv, 'hex'));
	const decrypted = Buffer.concat([decipher.update(Buffer.from(meta, 'hex')), decipher.final()]);
	const file: FileMetadata = JSON.parse(decrypted.toString());

	if(!file)
		throw new Error('Failed to decode file metadata');

	return file;
}

export async function storeFileMetadata(msgid: string, file: FileMetadata) {
	const metadata = encodeMetadata(file);
	msgCache.set(msgid, metadata);

	return await rest.patch(Routes.channelMessage(process.env.DISCORD_CHANNEL_ID!, msgid), {
		body: {
			content: metadata
		}
	});
}

export async function getFileMetadata(msgid: string) {
	let metadata: string;
	if(msgCache.has(msgid))
		metadata = msgCache.get(msgid)!;
	else {
		const msg = await rest.get(Routes.channelMessage(process.env.DISCORD_CHANNEL_ID!, msgid)) as RESTPostAPIChannelMessageResult;
		metadata = msg.content;
	}

	if(!metadata)
		return null;

	return decodeMetadata(metadata);
}

export async function sendChunksStreamable(chunks: Readable, boundary: string): Promise<RESTPostAPIChannelMessageResult> {
	return await rest.raw({
		method: RequestMethod.Post,
		fullRoute: Routes.channelMessages(process.env.DISCORD_CHANNEL_ID!),
		headers: {
			'Content-Type': `multipart/form-data; boundary=${boundary}`,
		},
		body: chunks,
		passThroughBody: true
	}).then(async (req) => {
		return req.body.json();
	});
}

export async function sendChunks(chunks: Buffer[]): Promise<RESTPostAPIChannelMessageResult> {
	return await rest.post(Routes.channelMessages(process.env.DISCORD_CHANNEL_ID!), {
		files: chunks.map((x, i) => ({
			contentType: 'application/zip',
			name: `chk-${i}.bin.zip`,
			data: x
		}))
	}) as RESTPostAPIChannelMessageResult;
}

export async function deleteChunkMessages(messages: string[]) {
	for(const msg of messages) {
		await rest.delete(Routes.channelMessage(process.env.DISCORD_CHANNEL_ID!, msg));
	}
}