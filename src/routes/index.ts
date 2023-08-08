import express = require('express');

export async function createRoutes() {
	const router = express.Router();

	router.use((await import('./auth')).createRoute());
	router.use((await import('./files')).createRoute());

	return router;
}