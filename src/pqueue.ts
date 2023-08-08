import { EventEmitter } from 'events';

type ResolveFunction<T> = (value: T | PromiseLike<T>) => void;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RejectFunction = (reason?: any) => void;
type ExecutorFunction<T> = (resolve: ResolveFunction<T>, reject: RejectFunction) => void;

export class DeferredPromise<T = void> extends Promise<T> {
	private readonly resolveProxy!: ResolveFunction<T>;
	private readonly rejectProxy!: RejectFunction;

	constructor(executor?: ExecutorFunction<T>) {
		let resolveProxy: ResolveFunction<T>;
		let rejectProxy: RejectFunction;

		super((resolve, reject) => {
			resolveProxy = resolve;
			rejectProxy = reject;

			if(executor)
				executor(resolve, reject);
		});

		this.resolveProxy = resolveProxy!;
		this.rejectProxy = rejectProxy!;
	}

	public resolve(value: T | PromiseLike<T>) {
		this.resolveProxy(value);
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	public reject(reason?: any) {
		this.rejectProxy(reason);
	}
}

export class PromiseQueue extends EventEmitter {
	private tasks: number;

	constructor() {
		super();
		this.tasks = 0;
	}

	public isEmpty(): boolean {
		return this.tasks === 0;
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	public async add(task: Promise<any>) {
		this.tasks++;
		await task;
		this.tasks--;
		
		if (this.isEmpty())
			this.emit('empty');
	}
}