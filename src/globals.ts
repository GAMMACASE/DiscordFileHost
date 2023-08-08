import * as realm from 'realm';

class Globals {
	public app!: Express.Application;
	public db!: realm;
}

export = new Globals();