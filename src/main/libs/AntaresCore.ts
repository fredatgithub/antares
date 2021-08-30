import { Core } from '../interfaces/Core';
import { ConnectionArguments, QueryObject, QueryArguments } from '../interfaces/misc';

/**
 * As Simple As Possible Query Builder Core
 *
 * @class AntaresCore
 */
export class AntaresCore implements Core {
   _client: string;
   protected _params;
   protected _poolSize: number | false;
   protected _logger: Function;
   protected _queryDefaults: QueryObject;
   protected _query: QueryObject;

   /**
    * Creates an instance of AntaresCore.
    *
    * @param {ConnectionArguments} args connection params
    * @memberof AntaresCore
    */
   constructor (args: ConnectionArguments) {
      this._client = args.client;
      this._params = args.params;
      this._poolSize = args.poolSize || false;
      this._logger = args.logger || console.log;

      this._queryDefaults = {
         schema: '',
         select: [],
         from: '',
         where: [],
         groupBy: [],
         orderBy: [],
         limit: [],
         offset: [],
         join: [],
         update: [],
         insert: [],
         delete: false
      };
      this._query = Object.assign({}, this._queryDefaults);
   }

   _reducer (acc:Array<string | number>, curr: number | string | Array<string | number> | { [key: string]: string; }) {
      if (typeof curr === 'number' || typeof curr === 'string')
         return [...acc, curr];
      if (Array.isArray(curr))
         return [...acc, ...curr];
      else if (typeof curr === 'object') {
         const clausoles: Array<string> = [];
         for (const key in curr)
            clausoles.push(`${key} ${curr[key]}`);

         return clausoles;
      }
      return acc;
   }

   /**
    * Resets the query object after a query
    *
    * @memberof AntaresCore
    */
   _resetQuery () {
      this._query = Object.assign({}, this._queryDefaults);
   }

   schema (schema: string) {
      this._query.schema = schema;
      return this;
   }

   select (...args: Array<string>) {
      this._query.select = [...this._query.select, ...args];
      return this;
   }

   from (table: string) {
      this._query.from = table;
      return this;
   }

   into (table: string) {
      this._query.from = table;
      return this;
   }

   delete (table: string) {
      this._query.delete = true;
      this.from(table);
      return this;
   }

   where (...args: Array<string | {[key: string]: string}>) {
      this._query.where = [...this._query.where, ...args];
      return this;
   }

   groupBy (...args: Array<string>) {
      this._query.groupBy = [...this._query.groupBy, ...args];
      return this;
   }

   orderBy (...args: Array<string | {[key: string]: string}>) {
      this._query.orderBy = [...this._query.orderBy, ...args];
      return this;
   }

   limit (...args: Array<number>) {
      this._query.limit = args;
      return this;
   }

   offset (...args: Array<number>) {
      this._query.offset = args;
      return this;
   }

   /**
    * @param {String | Array} args field = value
    * @returns
    * @memberof AntaresCore
    */
   update (...args: Array<string>) {
      this._query.update = [...this._query.update, ...args];
      return this;
   }

   /**
    * @param {Array} arr Array of row objects
    * @returns
    * @memberof AntaresCore
    */
   insert (arr: Array<string>) {
      this._query.insert = [...this._query.insert, ...arr];
      return this;
   }

   /**
    * @param {QueryArguments} args
    * @returns {Promise}
    * @memberof AntaresCore
    */
   async run (args?: QueryArguments) {
      const rawQuery = this.getSQL();
      this._resetQuery();
      return this.raw(rawQuery, args);
   }

   raw (query: string, args?: QueryArguments): Promise<any> | void {}

   getSQL (): string {
      return '';
   }
}
