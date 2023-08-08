/* eslint-disable @typescript-eslint/no-explicit-any */
import { Readable, DuplexOptions, Duplex } from 'stream';

export class ChainSplitter extends Duplex {
	private splitSize: number;
	private buffers: Buffer[];

	constructor(splitSize: number, options?: DuplexOptions) {
		super({ ...options, objectMode: true });

		this.buffers = [];
		this.splitSize = splitSize;
	}

	_read(size: number): void { }

	_write(chunk: Buffer, encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
		this.buffers.push(chunk);
		
		if(this.buffers.length >= this.splitSize) {
			this.push(this.buffers);
			this.buffers.splice(0, this.buffers.length);
		}

		callback();
	}

	_final(callback: (error?: Error | null) => void): void {
		if(this.buffers.length != 0)
			this.push(this.buffers);
		this.push(null);
		callback();
	}
}

export class ChunkSplitter extends Duplex {
	private chunkSize: number;
	private buffers: Buffer[];

	constructor(chunkSize: number, options?: DuplexOptions) {
		super(options);

		this.buffers = [];
		this.chunkSize = chunkSize;
	}

	_read(size: number): void { }

	_write(chunk: Buffer, encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
		const chunkSize = this.buffers.reduce((prev, curr) => prev + curr.length, 0);

		if(chunkSize + chunk.length >= this.chunkSize) {
			const diff = this.chunkSize - chunkSize;

			this.buffers.push(chunk.subarray(0, diff));
			this.push(Buffer.concat(this.buffers));
			this.buffers.splice(0, this.buffers.length);

			let bytesWritten = diff;
			do {
				const cutchunk = chunk.subarray(bytesWritten, bytesWritten + this.chunkSize);
				bytesWritten += this.chunkSize;

				if(cutchunk.length >= this.chunkSize)
					this.push(cutchunk);
				else
					this.buffers.push(cutchunk);
			}
			while(bytesWritten < chunk.length);
		}
		else
			this.buffers.push(chunk);

		callback();
	}

	_final(callback: (error?: Error | null) => void): void {
		if(this.buffers.length != 0)
			this.push(Buffer.concat(this.buffers));
		this.push(null);
		callback();
	}
}

export class ChunkSplitterStreamable extends Duplex {
	private chunkSize: number;
	private currentChunkSize: number;
	private chunkSplit: number;
	private boundary: string;
	private totalChunksDone: number;
	private activeStream: Readable | null;

	constructor(chunkSize: number, chunkSplit: number, boundary: string, options?: DuplexOptions) {
		super({ ...options, objectMode: true });

		this.currentChunkSize = 0;
		this.chunkSize = chunkSize;
		this.chunkSplit = chunkSplit;
		this.boundary = boundary;
		this.totalChunksDone = 0;
		this.activeStream = null;
	}

	_construct(callback: (error?: Error | null | undefined) => void): void {
		this.createNewInternalStream();
		this.writeInternal(this.createFileHeader());
		callback();
	}

	_read(size: number): void { }

	private createFileHeader() {
		return Buffer.from(`--${this.boundary}\r\nContent-Disposition: form-data; name="files[${this.totalChunksDone}]"; filename="chk-${this.totalChunksDone}.zip"\r\nContent-Type: application/gzip\r\n\r\n`);
	}

	private createFileFooter() {
		return Buffer.from('\r\n');
	}

	private createFormDataFooter() {
		return Buffer.from(`\r\n--${this.boundary}--\r\n`);
	}

	private writeInternal(chunk: Buffer) {
		this.activeStream?.push(chunk);
	}

	private stopInternal() {
		this.activeStream?.push(null);
	}

	private createNewInternalStream() {
		this.activeStream = new Duplex({
			read: (size) => { },
			write: function (ch, enc, cb) {
				this.push(ch);
				cb();
			}
		});

		this.push(this.activeStream);
	}

	private createNewChunk() {
		this.totalChunksDone++;

		if(this.totalChunksDone >= this.chunkSplit) {
			this.writeInternal(this.createFormDataFooter());
			this.stopInternal();
			this.createNewInternalStream();
			this.totalChunksDone = 0;
		}
		else
			this.writeInternal(this.createFileFooter());

		this.currentChunkSize = 0;
		this.writeInternal(this.createFileHeader());
	}

	async _write(chunk: Buffer, encoding: BufferEncoding, callback: (error?: Error | null) => void) {
		if(this.currentChunkSize + chunk.length >= this.chunkSize) {
			const diff = this.chunkSize - this.currentChunkSize;

			this.writeInternal(chunk.subarray(0, diff));

			this.createNewChunk();

			let bytesWritten = diff;
			do {
				const cutchunk = chunk.subarray(bytesWritten, bytesWritten + this.chunkSize);
				bytesWritten += this.chunkSize;

				if(cutchunk.length >= this.chunkSize) {
					this.writeInternal(cutchunk);
					this.createNewChunk();
				}
				else {
					this.writeInternal(cutchunk);
					this.currentChunkSize = cutchunk.length;
				}
			}
			while(bytesWritten < chunk.length);
		}
		else {
			this.writeInternal(chunk);
			this.currentChunkSize += chunk.length;
		}

		callback();
	}

	async _final(callback: (error?: Error | null) => void) {
		this.writeInternal(this.createFormDataFooter());
		this.stopInternal();
		
		this.push(null);
		callback();
	}
}