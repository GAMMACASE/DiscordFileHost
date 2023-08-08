import * as realm from 'realm';
import * as fs from 'fs';

type StaticSchemaTypes = {
	bool: boolean;
	string: string;
	objectId: realm.BSON.ObjectId;
	int: number;
	float: number;
	double: number;
	data: ArrayBuffer;
	date: Date;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	mixed: any;
	uuid: realm.BSON.UUID;

	// Custom Types
	FileUpload: FileUpload;
	User: User;
}

type SchemaToArray<T> = { [key in keyof T as `${string & key}[]`]: realm.List<T[key]> }
type SchemaToSet<T> = { [key in keyof T as `${string & key}<>`]: realm.Set<T[key]> }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SchemaToDictionary<T> = { [key in keyof T as `${string & key}{}`]: realm.Dictionary<T[key]> } & { '{}': realm.Dictionary<any> }
type SchemaToUndefined<T> = { [key in keyof T as `${string & key}?`]: T[key] | undefined | null }
type UnknownSchema = { [key: string]: unknown; }

type SchemaTypesMap = StaticSchemaTypes & SchemaToArray<StaticSchemaTypes> & SchemaToSet<StaticSchemaTypes> & SchemaToDictionary<StaticSchemaTypes>
type SchemaTypesMapFull = SchemaTypesMap & SchemaToUndefined<SchemaTypesMap> & UnknownSchema
type MapSchemaType<T extends keyof SchemaTypesMapFull> = SchemaTypesMapFull[T]
type MapSchemaProp<T extends string | realm.ObjectSchemaProperty> = 
	T extends { type: 'set', objectType: string } ? 
		realm.Set<MapSchemaType<Exclude<T['objectType'], realm.ObjectSchemaProperty>>> :
		T extends { type: 'dictionary', objectType: string } ? 
			realm.Dictionary<MapSchemaType<Exclude<T['objectType'], realm.ObjectSchemaProperty>>> :
			T extends { type: 'list', objectType: string } ? 
				realm.List<MapSchemaType<Exclude<T['objectType'], realm.ObjectSchemaProperty>>> :
				T extends { type: 'linkingObjects', objectType: string } ? 
					realm.Results<MapSchemaType<Exclude<T['objectType'], realm.ObjectSchemaProperty>>> :
					T extends { type: string } ? 
						MapSchemaType<Exclude<T['type'], realm.ObjectSchemaProperty>> : 
						MapSchemaType<Exclude<T, realm.ObjectSchemaProperty>>
type MapObjectSchema<T extends realm.ObjectSchema> = {
	-readonly [key in keyof T['properties']]: MapSchemaProp<T['properties'][key]>
}

const userSchema = {
	name: 'User',
	primaryKey: 'section',
	properties: {
		section: 'string',
		auth: 'string',
		refresh: 'string',
		files: 'FileUpload[]'
	}
} as const;

const fileUploadSchema = {
	name: 'FileUpload',
	primaryKey: 'ident',
	properties: {
		ident: 'string',
		filename: 'string',
		mimetype: 'string',
		size: 'int',
		date: 'date',
		views: 'int',
		attachments: 'string[]',
		messages: 'string[]'
	}
} as const;

export type User = MapObjectSchema<typeof userSchema>;
export type FileUpload = MapObjectSchema<typeof fileUploadSchema>;

export async function loadDatabaseClient() {
	if(!fs.existsSync('./db')) {
		fs.mkdirSync('./db');
	}

	return await realm.open({
		path: './db/local.realm',
		schema: [userSchema, fileUploadSchema]
	});
}