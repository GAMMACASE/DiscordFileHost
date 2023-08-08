import 'dotenv/config';

// Make sure required secrets are set correctly!
if(!process.env.METADATA_ENCRYPTION_SECRET || process.env.METADATA_ENCRYPTION_SECRET.length !== 32) {
	console.error('Environment value METADATA_ENCRYPTION_SECRET is not set or invalid.\nMake sure its length is exactly 32 symbols!\nCheck .env configuration! ');
	process.exit(1);
}

if(!process.env.EXPRESS_JWT_REFRESH_SECRET || process.env.EXPRESS_JWT_REFRESH_SECRET.length < 16) {
	console.error('Environment value EXPRESS_JWT_REFRESH_SECRET is not set or invalid.\nMake sure its length 16 or more symbols!\nCheck .env configuration! ');
	process.exit(1);
}

if(!process.env.EXPRESS_JWT_ACCESS_SECRET || process.env.EXPRESS_JWT_ACCESS_SECRET.length < 16) {
	console.error('Environment value EXPRESS_JWT_ACCESS_SECRET is not set or invalid.\nMake sure its length 16 or more symbols!\nCheck .env configuration! ');
	process.exit(1);
}

import { loadExpressApp } from 'express_server';
import { loadDatabaseClient } from 'database_client';
import globals = require('globals');

(async () => {
	globals.db = await loadDatabaseClient();
	globals.app = await loadExpressApp();

	console.log('App has loaded');
})();

process.on('unhandledRejection', (e) => {
	console.error('Got unhandledRejection. Error:', e);
});