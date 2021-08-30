import mysql from 'mysql2/promise';
import { AntaresCore } from '../AntaresCore';
import SSH2Promise from 'ssh2-promise';
import { ClientClass } from '../../interfaces/ClientClass';
import {
   DatabaseType,
   DatabaseTypes,
   ConnectionArguments,
   ColumnPacket,
   QueryArguments,
   QueryResult,
   TableParams,
   ViewParams,
   TriggerParams,
   RoutineParams,
   FunctionParams,
   SchedulerParams
} from '../../interfaces/misc';
import TunnelConfig from 'ssh2-promise/lib/tunnelConfig';

const dataTypes: Array<DatabaseTypes> = require('common/data-types/mysql');

export class MySQLClient extends AntaresCore implements ClientClass {
   private _ssh: SSH2Promise | null;
   private _tunnel: TunnelConfig | null;
   protected _connection: mysql.Connection | mysql.Pool | null;
   public types: {[key:number]: string}

   constructor (args: ConnectionArguments) {
      super(args);

      this._connection = null;
      this._ssh = null;
      this._tunnel = null;

      this.types = {
         0: 'DECIMAL',
         1: 'TINYINT',
         2: 'SMALLINT',
         3: 'INT',
         4: 'FLOAT',
         5: 'DOUBLE',
         6: 'NULL',
         7: 'TIMESTAMP',
         8: 'BIGINT',
         9: 'MEDIUMINT',
         10: 'DATE',
         11: 'TIME',
         12: 'DATETIME',
         13: 'YEAR',
         14: 'NEWDATE',
         15: 'VARCHAR',
         16: 'BIT',
         17: 'TIMESTAMP2',
         18: 'DATETIME2',
         19: 'TIME2',
         245: 'JSON',
         246: 'NEWDECIMAL',
         247: 'ENUM',
         248: 'SET',
         249: 'TINY_BLOB',
         250: 'MEDIUM_BLOB',
         251: 'LONG_BLOB',
         252: 'BLOB',
         253: 'VARCHAR',
         254: 'CHAR',
         255: 'GEOMETRY'
      };
   }

   _getType (field: {[key: string]: any}) {
      let name = this.types[field.columnType];
      let length = field.columnLength;

      if (['DATE', 'TIME', 'YEAR', 'DATETIME'].includes(name))
         length = field.decimals;

      if (name === 'TIMESTAMP')
         length = 0;

      if (field.charsetNr === 63) { // if binary
         if (name === 'CHAR')
            name = 'BINARY';
         else if (name === 'VARCHAR')
            name = 'VARBINARY';
      }

      if (name === 'BLOB') {
         switch (length) {
            case 765:
               name = 'TYNITEXT';
               break;
            case 196605:
               name = 'TEXT';
               break;
            case 50331645:
               name = 'MEDIUMTEXT';
               break;
            case 4294967295:
               name = field.charsetNr === 63 ? 'LONGBLOB' : 'LONGTEXT';
               break;
            case 255:
               name = 'TINYBLOB';
               break;
            case 65535:
               name = 'BLOB';
               break;
            case 16777215:
               name = 'MEDIUMBLOB';
               break;
            default:
               name = field.charsetNr === 63 ? 'BLOB' : 'TEXT';
         }
      }

      return { name, length };
   }

   _getTypeInfo (type: string) {
      return dataTypes
         .reduce((acc:Array<DatabaseType>, curr) => [...acc, ...curr.types], [])
         .filter(_type => _type.name === type.toUpperCase())[0];
   }

   /**
    * @memberof MySQLClient
    */
   async connect () {
      delete this._params.application_name;

      const dbConfig: mysql.ConnectionOptions = {
         host: this._params.host,
         port: this._params.port,
         user: this._params.user,
         password: this._params.password,
         ssl: undefined
      };

      if (this._params.schema?.length)
         dbConfig.database = this._params.schema;

      if (this._params.ssl)
         dbConfig.ssl = { ...this._params.ssl };

      if (this._params.ssh) {
         this._ssh = new SSH2Promise({ ...this._params.ssh });

         this._tunnel = await this._ssh.addTunnel({
            remoteAddr: this._params.host,
            remotePort: this._params.port
         });

         if (this._tunnel)
            dbConfig.port = this._tunnel.localPort;
      }

      if (!this._poolSize)
         this._connection = await mysql.createConnection(dbConfig);
      else {
         this._connection = mysql.createPool({
            ...dbConfig,
            connectionLimit: this._poolSize,
            typeCast: (field, next) => {
               if (field.type === 'DATETIME')
                  return field.string();
               else
                  return next();
            }
         });
      }
   }

   /**
    * @memberof MySQLClient
    */
   destroy () {
      this._connection?.end();
      this._ssh?.close();
   }

   /**
    * Executes an USE query
    *
    * @param {String} schema
    * @memberof MySQLClient
    */
   async use (schema: string) {
      await this.raw(`USE \`${schema}\``);
   }

   /**
    * @param {Array} schemas list
    * @returns {Array.<Object>} databases scructure
    * @memberof MySQLClient
    */
   async getStructure (schemas: Set<string>) {
      const { rows: databases } = <QueryResult> await this.raw('SHOW DATABASES');

      if (!databases) return;

      let filteredDatabases = databases;

      if (this._params.schema)
         filteredDatabases = filteredDatabases.filter(db => db.Database === this._params.schema);

      const { rows: functions } = <QueryResult> await this.raw('SHOW FUNCTION STATUS');
      const { rows: procedures } = <QueryResult> await this.raw('SHOW PROCEDURE STATUS');
      const { rows: schedulers } = <QueryResult> await this.raw('SELECT *, EVENT_SCHEMA AS `Db`, EVENT_NAME AS `Name` FROM information_schema.`EVENTS`');

      const tablesArr: Array<mysql.RowDataPacket> = [];
      const triggersArr: Array<mysql.RowDataPacket> = [];

      for (const db of filteredDatabases) {
         if (!schemas.has(db.Database)) continue;

         let { rows: tables } = <QueryResult> await this.raw(`SHOW TABLE STATUS FROM \`${db.Database}\``);
         if (tables?.length) {
            tables = tables.map(table => {
               table.Db = db.Database;
               return table;
            });
            tablesArr.push(...tables);
         }

         let { rows: triggers } = <QueryResult> await this.raw(`SHOW TRIGGERS FROM \`${db.Database}\``);
         if (triggers?.length) {
            triggers = triggers.map(trigger => {
               trigger.Db = db.Database;
               return trigger;
            });
            triggersArr.push(...triggers);
         }
      }

      return filteredDatabases.map(db => {
         if (schemas.has(db.Database)) {
            // TABLES
            const remappedTables = tablesArr.filter(table => table.Db === db.Database).map(table => {
               let tableType;
               switch (table.Comment) {
                  case 'VIEW':
                     tableType = 'view';
                     break;
                  default:
                     tableType = 'table';
                     break;
               }

               return {
                  name: table.Name,
                  type: tableType,
                  rows: table.Rows,
                  created: table.Create_time,
                  updated: table.Update_time,
                  engine: table.Engine,
                  comment: table.Comment,
                  size: table.Data_length + table.Index_length,
                  autoIncrement: table.Auto_increment,
                  collation: table.Collation
               };
            });

            // PROCEDURES
            const remappedProcedures = procedures?.filter(procedure => procedure.Db === db.Database).map(procedure => {
               return {
                  name: procedure.Name,
                  type: procedure.Type,
                  definer: procedure.Definer,
                  created: procedure.Created,
                  updated: procedure.Modified,
                  comment: procedure.Comment,
                  charset: procedure.character_set_client,
                  security: procedure.Security_type
               };
            });

            // FUNCTIONS
            const remappedFunctions = functions?.filter(func => func.Db === db.Database).map(func => {
               return {
                  name: func.Name,
                  type: func.Type,
                  definer: func.Definer,
                  created: func.Created,
                  updated: func.Modified,
                  comment: func.Comment,
                  charset: func.character_set_client,
                  security: func.Security_type
               };
            });

            // SCHEDULERS
            const remappedSchedulers = schedulers?.filter(scheduler => scheduler.Db === db.Database).map(scheduler => {
               return {
                  name: scheduler.EVENT_NAME,
                  definition: scheduler.EVENT_DEFINITION,
                  type: scheduler.EVENT_TYPE,
                  definer: scheduler.DEFINER,
                  body: scheduler.EVENT_BODY,
                  starts: scheduler.STARTS,
                  ends: scheduler.ENDS,
                  status: scheduler.STATUS,
                  executeAt: scheduler.EXECUTE_AT,
                  intervalField: scheduler.INTERVAL_FIELD,
                  intervalValue: scheduler.INTERVAL_VALUE,
                  onCompletion: scheduler.ON_COMPLETION,
                  originator: scheduler.ORIGINATOR,
                  sqlMode: scheduler.SQL_MODE,
                  created: scheduler.CREATED,
                  updated: scheduler.LAST_ALTERED,
                  lastExecuted: scheduler.LAST_EXECUTED,
                  comment: scheduler.EVENT_COMMENT,
                  charset: scheduler.CHARACTER_SET_CLIENT,
                  timezone: scheduler.TIME_ZONE
               };
            });

            // TRIGGERS
            const remappedTriggers = triggersArr.filter(trigger => trigger.Db === db.Database).map(trigger => {
               return {
                  name: trigger.Trigger,
                  statement: trigger.Statement,
                  timing: trigger.Timing,
                  definer: trigger.Definer,
                  event: trigger.Event,
                  table: trigger.Table,
                  sqlMode: trigger.sql_mode,
                  created: trigger.Created,
                  charset: trigger.character_set_client
               };
            });

            return {
               name: db.Database,
               tables: remappedTables,
               functions: remappedFunctions,
               procedures: remappedProcedures,
               triggers: remappedTriggers,
               schedulers: remappedSchedulers
            };
         }
         else {
            return {
               name: db.Database,
               tables: [],
               functions: [],
               procedures: [],
               triggers: [],
               schedulers: []
            };
         }
      });
   }

   /**
    * @param {Object} params
    * @param {String} params.schema
    * @param {String} params.table
    * @returns {Object} table scructure
    * @memberof MySQLClient
    */
   async getTableColumns ({ schema, table }: { schema: string, table: string}): Promise<Array<ColumnPacket> | undefined> {
      const { rows } = await this
         .select('*')
         .schema('information_schema')
         .from('COLUMNS')
         .where({ TABLE_SCHEMA: `= '${schema}'`, TABLE_NAME: `= '${table}'` })
         .orderBy({ ORDINAL_POSITION: 'ASC' })
         .run();

      const { rows: fields } = <QueryResult> await this.raw(`SHOW CREATE TABLE \`${schema}\`.\`${table}\``);

      const remappedFields = fields?.map(row => {
         if (!row['Create Table']) return false;

         let n = 0;
         return row['Create Table']
            .split('')
            .reduce((acc: string, curr: string) => {
               if (curr === ')') n--;
               if (n !== 0) acc += curr;
               if (curr === '(') n++;
               return acc;
            }, '')
            .replaceAll('\n', '')
            .split(',')
            .map((f: string) => {
               try {
                  const fieldArr = f.trim().split(' ');
                  const nameAndType = fieldArr.slice(0, 2);
                  if (nameAndType[0].charAt(0) !== '`') return false;

                  const details: string = fieldArr.slice(2).join(' ');
                  let defaultValue: string | null = null;

                  if (details.includes('DEFAULT') && details) {
                     const strings = details.match(/(?<=DEFAULT ).*?$/gs);
                     defaultValue = strings?.length ? strings[0].split(' COMMENT')[0] : null;
                     // const defaultValueArr = defaultValue.split('');
                     // if (defaultValueArr[0] === '\'') {
                     //    defaultValueArr.shift();
                     //    defaultValueArr.pop();
                     //    defaultValue = defaultValueArr.join('');
                     // }
                  }

                  const typeAndLength = nameAndType[1].replace(')', '').split('(');

                  return {
                     name: (nameAndType[0] as any).replaceAll('`', ''),
                     type: typeAndLength[0].toUpperCase(),
                     length: typeAndLength[1] ? typeAndLength[1] : null,
                     default: defaultValue
                  };
               }
               catch (err) {
                  return false;
               }
            })
            .filter(Boolean)
            .reduce((acc: {[key: string]: object}, curr: {[key: string]: string}) => {
               acc[curr.name] = curr;
               return acc;
            }, {});
      })[0];

      return rows.map((field: mysql.RowDataPacket) => {
         let numLength = field.COLUMN_TYPE.match(/int\(([^)]+)\)/);
         numLength = numLength ? +numLength.pop() : null;
         const enumValues = /(enum|set)/.test(field.COLUMN_TYPE)
            ? field.COLUMN_TYPE.match(/\(([^)]+)\)/)[0].slice(1, -1)
            : null;

         return {
            name: field.COLUMN_NAME,
            key: field.COLUMN_KEY.toLowerCase(),
            type: remappedFields ? remappedFields[field.COLUMN_NAME].type : field.DATA_TYPE,
            schema: field.TABLE_SCHEMA,
            table: field.TABLE_NAME,
            numPrecision: field.NUMERIC_PRECISION,
            numLength,
            enumValues,
            datePrecision: field.DATETIME_PRECISION,
            charLength: field.CHARACTER_MAXIMUM_LENGTH,
            nullable: field.IS_NULLABLE.includes('YES'),
            unsigned: field.COLUMN_TYPE.includes('unsigned'),
            zerofill: field.COLUMN_TYPE.includes('zerofill'),
            order: field.ORDINAL_POSITION,
            default: remappedFields ? remappedFields[field.COLUMN_NAME].default : field.COLUMN_DEFAULT,
            charset: field.CHARACTER_SET_NAME,
            collation: field.COLLATION_NAME,
            autoIncrement: field.EXTRA.includes('auto_increment'),
            onUpdate: field.EXTRA.toLowerCase().includes('on update') ? field.EXTRA.replace('on update', '') : '',
            comment: field.COLUMN_COMMENT
         };
      });
   }

   /**
    * @param {Object} params
    * @param {String} params.schema
    * @param {String} params.table
    * @returns {Object} table row count
    * @memberof MySQLClient
    */
   async getTableApproximateCount ({ schema, table }:{ schema: string, table: string}) {
      const { rows } = <QueryResult> await this.raw(`SELECT table_rows "count" FROM information_schema.tables WHERE table_name = "${table}" AND table_schema = "${schema}"`);

      return rows?.length ? +rows[0].count : 0;
   }

   /**
    * @param {Object} params
    * @param {String} params.schema
    * @param {String} params.table
    * @returns {Object} table options
    * @memberof MySQLClient
    */
   async getTableOptions ({ schema, table }:{ schema: string, table: string}): Promise<any> {
      const { rows } = <QueryResult> await this.raw(`SHOW TABLE STATUS FROM \`${schema}\` WHERE Name = '${table}'`);

      if (rows?.length) {
         let tableType;
         switch (rows[0].Comment) {
            case 'VIEW':
               tableType = 'view';
               break;
            default:
               tableType = 'table';
               break;
         }

         return {
            name: rows[0].Name,
            type: tableType,
            rows: rows[0].Rows,
            created: rows[0].Create_time,
            updated: rows[0].Update_time,
            engine: rows[0].Engine,
            comment: rows[0].Comment,
            size: rows[0].Data_length + rows[0].Index_length,
            autoIncrement: rows[0].Auto_increment,
            collation: rows[0].Collation
         };
      };
      return {};
   }

   /**
    * @param {Object} params
    * @param {String} params.schema
    * @param {String} params.table
    * @returns {Object} table indexes
    * @memberof MySQLClient
    */
   async getTableIndexes ({ schema, table }:{ schema: string, table: string}): Promise<any> {
      const { rows } = <QueryResult> await this.raw(`SHOW INDEXES FROM \`${table}\` FROM \`${schema}\``);

      return rows?.map(row => {
         return {
            unique: !row.Non_unique,
            name: row.Key_name,
            column: row.Column_name,
            indexType: row.Index_type,
            type: row.Key_name === 'PRIMARY' ? 'PRIMARY' : !row.Non_unique ? 'UNIQUE' : row.Index_type === 'FULLTEXT' ? 'FULLTEXT' : 'INDEX',
            cardinality: row.Cardinality,
            comment: row.Comment,
            indexComment: row.Index_comment
         };
      });
   }

   /**
    * @param {Object} params
    * @param {String} params.schema
    * @param {String} params.table
    * @returns {Object} table key usage
    * @memberof MySQLClient
    */
   async getKeyUsage ({ schema, table }:{ schema: string, table: string}): Promise<any> {
      const { rows } = await this
         .select('*')
         .schema('information_schema')
         .from('KEY_COLUMN_USAGE')
         .where({ TABLE_SCHEMA: `= '${schema}'`, TABLE_NAME: `= '${table}'`, REFERENCED_TABLE_NAME: 'IS NOT NULL' })
         .run();

      const { rows: extras } = await this
         .select('*')
         .schema('information_schema')
         .from('REFERENTIAL_CONSTRAINTS')
         .where({ CONSTRAINT_SCHEMA: `= '${schema}'`, TABLE_NAME: `= '${table}'`, REFERENCED_TABLE_NAME: 'IS NOT NULL' })
         .run();

      return rows?.map((field: {[key: string]: string}) => {
         const extra = extras.find((x: {[key: string]: string}) => x.CONSTRAINT_NAME === field.CONSTRAINT_NAME);
         return {
            schema: field.TABLE_SCHEMA,
            table: field.TABLE_NAME,
            field: field.COLUMN_NAME,
            position: field.ORDINAL_POSITION,
            constraintPosition: field.POSITION_IN_UNIQUE_CONSTRAINT,
            constraintName: field.CONSTRAINT_NAME,
            refSchema: field.REFERENCED_TABLE_SCHEMA,
            refTable: field.REFERENCED_TABLE_NAME,
            refField: field.REFERENCED_COLUMN_NAME,
            onUpdate: extra.UPDATE_RULE,
            onDelete: extra.DELETE_RULE
         };
      });
   }

   /**
    * SELECT `user`, `host`, authentication_string) AS `password` FROM `mysql`.`user`
    *
    * @returns {Array.<Object>} users list
    * @memberof MySQLClient
    */
   async getUsers (): Promise<any> {
      const { rows } = <QueryResult> await this.raw('SELECT `user`, `host`, authentication_string AS `password` FROM `mysql`.`user`');

      return rows?.map(row => {
         return {
            name: row.user,
            host: row.host,
            password: row.password
         };
      });
   }

   /**
    * CREATE DATABASE
    *
    * @returns {Array.<Object>} parameters
    * @memberof MySQLClient
    */
   async createSchema (params: {name: string, collation: string}) {
      await this.raw(`CREATE DATABASE \`${params.name}\` COLLATE ${params.collation}`);
   }

   /**
    * ALTER DATABASE
    *
    * @returns {Array.<Object>} parameters
    * @memberof MySQLClient
    */
   async alterSchema (params: {name: string, collation: string}) {
      await this.raw(`ALTER DATABASE \`${params.name}\` COLLATE ${params.collation}`);
   }

   /**
    * DROP DATABASE
    *
    * @returns {Array.<Object>} parameters
    * @memberof MySQLClient
    */
   async dropSchema (params: {database: string}) {
      await this.raw(`DROP DATABASE \`${params.database}\``);
   }

   /**
    * @returns {Array.<Object>} parameters
    * @memberof MySQLClient
    */
   async getDatabaseCollation (params: {database: string}) {
      return <QueryResult> await this.raw(`SELECT \`DEFAULT_COLLATION_NAME\` FROM \`information_schema\`.\`SCHEMATA\` WHERE \`SCHEMA_NAME\`='${params.database}'`);
   }

   /**
    * SHOW CREATE VIEW
    *
    * @returns {Array.<Object>} view informations
    * @memberof MySQLClient
    */
   async getViewInformations ({ schema, view }:{ schema: string, view: string}) {
      const sql = `SHOW CREATE VIEW \`${schema}\`.\`${view}\``;
      const results = <QueryResult> await this.raw(sql);

      return results?.rows?.map(row => {
         return {
            algorithm: row['Create View'].match(/(?<=CREATE ALGORITHM=).*?(?=\s)/gs)[0],
            definer: row['Create View'].match(/(?<=DEFINER=).*?(?=\s)/gs)[0],
            security: row['Create View'].match(/(?<=SQL SECURITY ).*?(?=\s)/gs)[0],
            updateOption: row['Create View'].match(/(?<=WITH ).*?(?=\s)/gs) ? row['Create View'].match(/(?<=WITH ).*?(?=\s)/gs)[0] : '',
            sql: row['Create View'].match(/(?<=AS ).*?$/gs)[0],
            name: row.View
         };
      })[0];
   }

   /**
    * DROP VIEW
    *
    * @returns {Array.<Object>} parameters
    * @memberof MySQLClient
    */
   async dropView (params:{ schema: string, view: string}) {
      const sql = `DROP VIEW \`${params.schema}\`.\`${params.view}\``;
      await this.raw(sql);
   }

   /**
    *
    *
    * @param {{view: ViewParams}} params
    * @memberof MySQLClient
    */
   async alterView (params: {view: ViewParams}) {
      const { view } = params;
      let sql = `
         USE \`${view.schema}\`; 
         ALTER ALGORITHM = ${view.algorithm}${view.definer ? ` DEFINER=${view.definer}` : ''} 
         SQL SECURITY ${view.security} 
         VIEW \`${view.schema}\`.\`${view.oldName}\` AS ${view.sql} ${view.updateOption ? `WITH ${view.updateOption} CHECK OPTION` : ''}
      `;

      if (view.name !== view.oldName)
         sql += `; RENAME TABLE \`${view.schema}\`.\`${view.oldName}\` TO \`${view.schema}\`.\`${view.name}\``;

      await this.raw(sql);
   }

   /**
    *
    *
    * @param {ViewParams} params
    * @memberof MySQLClient
    */
   async createView (params: ViewParams) {
      const sql = `CREATE ALGORITHM = ${params.algorithm} ${params.definer ? `DEFINER=${params.definer} ` : ''}SQL SECURITY ${params.security} VIEW \`${params.schema}\`.\`${params.name}\` AS ${params.sql} ${params.updateOption ? `WITH ${params.updateOption} CHECK OPTION` : ''}`;
      await this.raw(sql);
   }

   /**
    *
    *
    * @param {{ schema: string, trigger: string}} { schema, trigger }
    * @return {*}
    * @memberof MySQLClient
    */
   async getTriggerInformations ({ schema, trigger }:{ schema: string, trigger: string}) {
      const sql = `SHOW CREATE TRIGGER \`${schema}\`.\`${trigger}\``;
      const results = <QueryResult> await this.raw(sql);

      return results?.rows?.map(row => {
         return {
            definer: row['SQL Original Statement'].match(/(?<=DEFINER=).*?(?=\s)/gs)[0],
            sql: row['SQL Original Statement'].match(/(BEGIN|begin)(.*)(END|end)/gs)[0],
            name: row.Trigger,
            table: row['SQL Original Statement'].match(/(?<=ON `).*?(?=`)/gs)[0],
            activation: row['SQL Original Statement'].match(/(BEFORE|AFTER)/gs)[0],
            event: row['SQL Original Statement'].match(/(INSERT|UPDATE|DELETE)/gs)[0]
         };
      })[0];
   }

   /**
    *
    *
    * @param {{ schema: string, trigger: string}} params
    * @memberof MySQLClient
    */
   async dropTrigger (params:{ schema: string, trigger: string}) {
      const sql = `DROP TRIGGER \`${params.schema}\`.\`${params.trigger}\``;
      await this.raw(sql);
   }

   /**
    *
    *
    * @param {{trigger: TriggerParams}} params
    * @memberof MySQLClient
    */
   async alterTrigger (params: {trigger: TriggerParams}) {
      const { trigger } = params;
      const tempTrigger = Object.assign({}, trigger);
      tempTrigger.name = `Antares_${tempTrigger.name}_tmp`;

      await this.dropTrigger({ schema: trigger.schema, trigger: tempTrigger.name });
      await this.dropTrigger({ schema: trigger.schema, trigger: trigger.oldName });
      await this.createTrigger(trigger);
   }

   /**
    *
    *
    * @param {TriggerParams} params
    * @memberof MySQLClient
    */
   async createTrigger (params: TriggerParams) {
      const sql = `CREATE ${params.definer ? `DEFINER=${params.definer} ` : ''}TRIGGER \`${params.schema}\`.\`${params.name}\` ${params.activation} ${params.event} ON \`${params.table}\` FOR EACH ROW ${params.sql}`;
      await this.raw(sql, { split: false });
   }

   /**
    *
    *
    * @param {{ schema: string, routine: string}} { schema, routine }
    * @return {*}
    * @memberof MySQLClient
    */
   async getRoutineInformations ({ schema, routine }: { schema: string, routine: string}) {
      const sql = `SHOW CREATE PROCEDURE \`${schema}\`.\`${routine}\``;
      const results = <QueryResult> await this.raw(sql);

      return results?.rows?.map(async row => {
         if (!row['Create Procedure']) {
            return {
               definer: null,
               sql: '',
               parameters: [],
               name: row.Procedure,
               comment: '',
               security: 'DEFINER',
               deterministic: false,
               dataAccess: 'CONTAINS SQL'
            };
         }

         const sql = `SELECT * 
               FROM information_schema.parameters 
               WHERE SPECIFIC_NAME = '${routine}'
               AND SPECIFIC_SCHEMA = '${schema}'
               ORDER BY ORDINAL_POSITION
            `;

         const results = <QueryResult> await this.raw(sql);

         const parameters = results?.rows?.map(row => {
            return {
               name: row.PARAMETER_NAME,
               type: row.DATA_TYPE.toUpperCase(),
               length: row.NUMERIC_PRECISION || row.DATETIME_PRECISION || row.CHARACTER_MAXIMUM_LENGTH || '',
               context: row.PARAMETER_MODE
            };
         });

         let dataAccess = 'CONTAINS SQL';
         if (row['Create Procedure'].includes('NO SQL'))
            dataAccess = 'NO SQL';
         if (row['Create Procedure'].includes('READS SQL DATA'))
            dataAccess = 'READS SQL DATA';
         if (row['Create Procedure'].includes('MODIFIES SQL DATA'))
            dataAccess = 'MODIFIES SQL DATA';

         return {
            definer: row['Create Procedure'].match(/(?<=DEFINER=).*?(?=\s)/gs)[0],
            sql: row['Create Procedure'].match(/(BEGIN|begin)(.*)(END|end)/gs)[0],
            parameters: parameters || [],
            name: row.Procedure,
            comment: row['Create Procedure'].match(/(?<=COMMENT ').*?(?=')/gs) ? row['Create Procedure'].match(/(?<=COMMENT ').*?(?=')/gs)[0] : '',
            security: row['Create Procedure'].includes('SQL SECURITY INVOKER') ? 'INVOKER' : 'DEFINER',
            deterministic: row['Create Procedure'].includes('DETERMINISTIC'),
            dataAccess
         };
      })[0];
   }

   /**
    *
    *
    * @param {{ schema: string, routine: string}} params
    * @memberof MySQLClient
    */
   async dropRoutine (params: { schema: string, routine: string}) {
      const sql = `DROP PROCEDURE \`${params.schema}\`.\`${params.routine}\``;
      await this.raw(sql);
   }

   /**
    * ALTER PROCEDURE
    *
    * @returns {Array.<Object>} parameters
    * @memberof MySQLClient
    */
   async alterRoutine (params: {routine: RoutineParams}) {
      const { routine } = params;
      const tempProcedure = Object.assign({}, routine);
      tempProcedure.name = `Antares_${tempProcedure.name}_tmp`;

      await this.createRoutine(tempProcedure);
      await this.dropRoutine({ schema: routine.schema, routine: tempProcedure.name });
      await this.dropRoutine({ schema: routine.schema, routine: routine.oldName });
      await this.createRoutine(routine);
   }

   /**
    * CREATE PROCEDURE
    *
    * @returns {Array.<Object>} parameters
    * @memberof MySQLClient
    */
   async createRoutine (params: RoutineParams) {
      const parameters = 'parameters' in params
         ? params.parameters.reduce((acc: Array<string>, curr) => {
            acc.push(`${curr.context} \`${curr.name}\` ${curr.type}${curr.length ? `(${curr.length})` : ''}`);
            return acc;
         }, []).join(',')
         : '';

      const sql = `CREATE ${params.definer ? `DEFINER=${params.definer} ` : ''}PROCEDURE \`${params.schema}\`.\`${params.name}\`(${parameters})
         LANGUAGE SQL
         ${params.deterministic ? 'DETERMINISTIC' : 'NOT DETERMINISTIC'}
         ${params.dataAccess}
         SQL SECURITY ${params.security}
         COMMENT '${params.comment}'
         ${params.sql}`;

      await this.raw(sql, { split: false });
   }

   /**
    *
    *
    * @param {{ schema: string, func: string}} { schema, func }
    * @return {*}
    * @memberof MySQLClient
    */
   async getFunctionInformations ({ schema, func }: { schema: string, func: string}) {
      const sql = `SHOW CREATE FUNCTION \`${schema}\`.\`${func}\``;
      const results = <QueryResult> await this.raw(sql);

      return results?.rows?.map(async row => {
         if (!row['Create Function']) {
            return {
               definer: null,
               sql: '',
               parameters: [],
               name: row.Procedure,
               comment: '',
               security: 'DEFINER',
               deterministic: false,
               dataAccess: 'CONTAINS SQL',
               returns: 'INT',
               returnsLength: null
            };
         }

         const sql = `SELECT * 
            FROM information_schema.parameters 
            WHERE SPECIFIC_NAME = '${func}'
            AND SPECIFIC_SCHEMA = '${schema}'
            ORDER BY ORDINAL_POSITION
         `;

         const results = <QueryResult> await this.raw(sql);

         const parameters = results?.rows?.filter(row => row.PARAMETER_MODE).map(row => {
            return {
               name: row.PARAMETER_NAME,
               type: row.DATA_TYPE.toUpperCase(),
               length: row.NUMERIC_PRECISION || row.DATETIME_PRECISION || row.CHARACTER_MAXIMUM_LENGTH || '',
               context: row.PARAMETER_MODE
            };
         });

         let dataAccess = 'CONTAINS SQL';
         if (row['Create Function'].includes('NO SQL'))
            dataAccess = 'NO SQL';
         if (row['Create Function'].includes('READS SQL DATA'))
            dataAccess = 'READS SQL DATA';
         if (row['Create Function'].includes('MODIFIES SQL DATA'))
            dataAccess = 'MODIFIES SQL DATA';

         const output = row['Create Function'].match(/(?<=RETURNS ).*?(?=\s)/gs).length ? row['Create Function'].match(/(?<=RETURNS ).*?(?=\s)/gs)[0].replace(')', '').split('(') : ['', null];

         return {
            definer: row['Create Function'].match(/(?<=DEFINER=).*?(?=\s)/gs)[0],
            sql: row['Create Function'].match(/(BEGIN|begin)(.*)(END|end)/gs)[0],
            parameters: parameters || [],
            name: row.Function,
            comment: row['Create Function'].match(/(?<=COMMENT ').*?(?=')/gs) ? row['Create Function'].match(/(?<=COMMENT ').*?(?=')/gs)[0] : '',
            security: row['Create Function'].includes('SQL SECURITY INVOKER') ? 'INVOKER' : 'DEFINER',
            deterministic: row['Create Function'].includes('DETERMINISTIC'),
            dataAccess,
            returns: output[0].toUpperCase(),
            returnsLength: +output[1]
         };
      })[0];
   }

   /**
    *
    *
    * @param {{ schema: string, func: string}} params
    * @memberof MySQLClient
    */
   async dropFunction (params: { schema: string, func: string}) {
      const sql = `DROP FUNCTION \`${params.schema}\`.\`${params.func}\``;
      await this.raw(sql);
   }

   /**
    *
    *
    * @param {{func: FunctionParams}} params
    * @return {*}
    * @memberof MySQLClient
    */
   async alterFunction (params: {func: FunctionParams}) {
      const { func } = params;
      const tempProcedure = Object.assign({}, func);
      tempProcedure.name = `Antares_${tempProcedure.name}_tmp`;

      await this.createFunction(tempProcedure);
      await this.dropFunction({ schema: func.schema, func: tempProcedure.name });
      await this.dropFunction({ schema: func.schema, func: func.oldName });
      await this.createFunction(func);
   }

   /**
    * CREATE FUNCTION
    *
    * @returns {Array.<Object>} parameters
    * @memberof MySQLClient
    */
   async createFunction (params: FunctionParams) {
      const parameters = params.parameters.reduce((acc: Array<string>, curr) => {
         acc.push(`\`${curr.name}\` ${curr.type}${curr.length ? `(${curr.length})` : ''}`);
         return acc;
      }, []).join(',');

      const body = params.returns ? params.sql : 'BEGIN\n  RETURN 0;\nEND';

      const sql = `CREATE ${params.definer ? `DEFINER=${params.definer} ` : ''}FUNCTION \`${params.schema}\`.\`${params.name}\`(${parameters}) RETURNS ${params.returns || 'SMALLINT'}${params.returnsLength ? `(${params.returnsLength})` : ''}
         LANGUAGE SQL
         ${params.deterministic ? 'DETERMINISTIC' : 'NOT DETERMINISTIC'}
         ${params.dataAccess}
         SQL SECURITY ${params.security}
         COMMENT '${params.comment}'
         ${body}`;

      await this.raw(sql, { split: false });
   }

   /**
    * SHOW CREATE EVENT
    *
    * @returns {Array.<Object>} view informations
    * @memberof MySQLClient
    */
   async getEventInformations ({ schema, scheduler }: { schema: string, scheduler: string}) {
      const sql = `SHOW CREATE EVENT \`${schema}\`.\`${scheduler}\``;
      const results = <QueryResult> await this.raw(sql);

      return results?.rows?.map(row => {
         const schedule = row['Create Event'];
         const execution = schedule.includes('EVERY') ? 'EVERY' : 'ONCE';
         const every = execution === 'EVERY' ? row['Create Event'].match(/(?<=EVERY )(\s*([^\s]+)){0,2}/gs)[0].replaceAll('\'', '').split(' ') : [];
         const starts = execution === 'EVERY' && schedule.includes('STARTS') ? schedule.match(/(?<=STARTS ').*?(?='\s)/gs)[0] : '';
         const ends = execution === 'EVERY' && schedule.includes('ENDS') ? schedule.match(/(?<=ENDS ').*?(?='\s)/gs)[0] : '';
         const at = execution === 'ONCE' && schedule.includes('AT') ? schedule.match(/(?<=AT ').*?(?='\s)/gs)[0] : '';

         return {
            definer: row['Create Event'].match(/(?<=DEFINER=).*?(?=\s)/gs)[0],
            sql: row['Create Event'].match(/(?<=DO )(.*)/gs)[0],
            name: row.Event,
            comment: row['Create Event'].match(/(?<=COMMENT ').*?(?=')/gs) ? row['Create Event'].match(/(?<=COMMENT ').*?(?=')/gs)[0] : '',
            state: row['Create Event'].includes('ENABLE') ? 'ENABLE' : row['Create Event'].includes('DISABLE ON SLAVE') ? 'DISABLE ON SLAVE' : 'DISABLE',
            preserve: row['Create Event'].includes('ON COMPLETION PRESERVE'),
            execution,
            every,
            starts,
            ends,
            at
         };
      })[0];
   }

   /**
    * DROP EVENT
    *
    * @returns {Array.<Object>} parameters
    * @memberof MySQLClient
    */
   async dropEvent (params:{ schema: string, scheduler: string}) {
      const sql = `DROP EVENT \`${params.schema}\`.\`${params.scheduler}\``;
      await this.raw(sql);
   }

   /**
    * ALTER EVENT
    *
    * @returns {Array.<Object>} parameters
    * @memberof MySQLClient
    */
   async alterEvent (params: {scheduler: SchedulerParams}) {
      const { scheduler } = params;

      if (scheduler.execution === 'EVERY' && scheduler.every[0].includes('-'))
         scheduler.every[0] = `'${scheduler.every[0]}'`;

      const sql = `ALTER ${scheduler.definer ? ` DEFINER=${scheduler.definer}` : ''} EVENT \`${scheduler.schema}\`.\`${scheduler.oldName}\` 
      ON SCHEDULE
         ${scheduler.execution === 'EVERY'
      ? `EVERY ${scheduler.every.join(' ')}${scheduler.starts ? ` STARTS '${scheduler.starts}'` : ''}${scheduler.ends ? ` ENDS '${scheduler.ends}'` : ''}`
      : `AT '${scheduler.at}'`}
      ON COMPLETION${!scheduler.preserve ? ' NOT' : ''} PRESERVE
      ${scheduler.name !== scheduler.oldName ? `RENAME TO \`${scheduler.schema}\`.\`${scheduler.name}\`` : ''}
      ${scheduler.state}
      COMMENT '${scheduler.comment}'
      DO ${scheduler.sql}`;

      await this.raw(sql, { split: false });
   }

   /**
    * CREATE EVENT
    *
    * @returns {Array.<Object>} parameters
    * @memberof MySQLClient
    */
   async createEvent (params: SchedulerParams) {
      const sql = `CREATE ${params.definer ? ` DEFINER=${params.definer}` : ''} EVENT \`${params.schema}\`.\`${params.name}\` 
      ON SCHEDULE
         ${params.execution === 'EVERY'
      ? `EVERY ${params.every.join(' ')}${params.starts ? ` STARTS '${params.starts}'` : ''}${params.ends ? ` ENDS '${params.ends}'` : ''}`
      : `AT '${params.at}'`}
      ON COMPLETION${!params.preserve ? ' NOT' : ''} PRESERVE
      ${params.state}
      COMMENT '${params.comment}'
      DO ${params.sql}`;

      await this.raw(sql, { split: false });
   }

   /**
    * SHOW COLLATION
    *
    * @returns {Array.<Object>} collations list
    * @memberof MySQLClient
    */
   async getCollations () {
      const results = <QueryResult> await this.raw('SHOW COLLATION');

      return results?.rows?.map(row => {
         return {
            charset: <string> row.Charset,
            collation: <string> row.Collation,
            compiled: <string> row.Compiled.includes('Yes'),
            default: <string> row.Default.includes('Yes'),
            id: <number> row.Id,
            sortLen: <number> row.Sortlen
         };
      });
   }

   /**
    * SHOW VARIABLES
    *
    * @returns {Array.<Object>} variables list
    * @memberof MySQLClient
    */
   async getVariables () {
      const sql = 'SHOW VARIABLES';
      const results = <QueryResult> await this.raw(sql);

      return results?.rows?.map(row => {
         return {
            name: <string> row.Variable_name,
            value: <string> row.Value
         };
      });
   }

   /**
    *
    *
    * @return {*}
    * @memberof MySQLClient
    */
   async getEngines () {
      const sql = 'SHOW ENGINES';
      const results = <QueryResult> await this.raw(sql);

      return results?.rows?.map(row => {
         return {
            name: <string> row.Engine,
            support: <string> row.Support,
            comment: <string> row.Comment,
            transactions: <string> row.Transactions,
            xa: <string> row.XA,
            savepoints: <string> row.Savepoints,
            isDefault: <boolean> row.Support.includes('DEFAULT')
         };
      });
   }

   /**
    *
    *
    * @return {*}
    * @memberof MySQLClient
    */
   async getVersion () {
      const sql = 'SHOW VARIABLES LIKE "%vers%"';
      const { rows } = <QueryResult> await this.raw(sql);

      return rows?.reduce((acc: {[key: string]: string}, curr) => {
         switch (curr.Variable_name) {
            case 'version':
               acc.number = curr.Value.split('-')[0];
               break;
            case 'version_comment':
               acc.name = curr.Value.replace('(GPL)', '');
               break;
            case 'version_compile_machine':
               acc.arch = curr.Value;
               break;
            case 'version_compile_os':
               acc.os = curr.Value;
               break;
         }
         return acc;
      }, {});
   }

   /**
    *
    *
    * @return {*}
    * @memberof MySQLClient
    */
   async getProcesses () {
      const sql = 'SELECT `ID`, `USER`, `HOST`, `DB`, `COMMAND`, `TIME`, `STATE`, LEFT(`INFO`, 51200) AS `INFO` FROM `information_schema`.`PROCESSLIST`';

      const { rows } = <QueryResult> await this.raw(sql);

      return rows?.map(row => {
         return {
            id: <number> row.ID,
            user: <string> row.USER,
            host: row.HOST,
            database: <string> row.DB,
            command: <string> row.COMMAND,
            time: <number> row.TIME,
            state: <string> row.STATE,
            info: <string> row.INFO
         };
      });
   }

   /**
    * CREATE TABLE
    *
    * @returns {Array.<Object>} parameters
    * @memberof MySQLClient
    */
   async createTable (params: TableParams) {
      const {
         schema,
         fields,
         foreigns,
         indexes,
         options
      } = params;
      const newColumns: Array<string> = [];
      const newIndexes: Array<string> = [];
      const newForeigns: Array<string> = [];

      let sql = `CREATE TABLE \`${schema}\`.\`${options.name}\``;

      // ADD FIELDS
      fields.forEach(field => {
         const typeInfo = this._getTypeInfo(field.type);
         const length = typeInfo.length ? field.enumValues || field.numLength || field.charLength || field.datePrecision : false;

         newColumns.push(`\`${field.name}\` 
            ${field.type.toUpperCase()}${length ? `(${length})` : ''} 
            ${field.unsigned ? 'UNSIGNED' : ''} 
            ${field.zerofill ? 'ZEROFILL' : ''}
            ${field.nullable ? 'NULL' : 'NOT NULL'}
            ${field.autoIncrement ? 'AUTO_INCREMENT' : ''}
            ${field.default ? `DEFAULT ${field.default}` : ''}
            ${field.comment ? `COMMENT '${field.comment}'` : ''}
            ${field.collation ? `COLLATE ${field.collation}` : ''}
            ${field.onUpdate ? `ON UPDATE ${field.onUpdate}` : ''}`);
      });

      // ADD INDEX
      indexes.forEach(index => {
         const fields = index.fields.map(field => `\`${field}\``).join(',');
         let type = index.type;

         if (type === 'PRIMARY')
            newIndexes.push(`PRIMARY KEY (${fields})`);
         else {
            if (type === 'UNIQUE')
               type = 'UNIQUE INDEX';

            newIndexes.push(`${type} \`${index.name}\` (${fields})`);
         }
      });

      // ADD FOREIGN KEYS
      foreigns.forEach(foreign => {
         newForeigns.push(`CONSTRAINT \`${foreign.constraintName}\` FOREIGN KEY (\`${foreign.field}\`) REFERENCES \`${foreign.refTable}\` (\`${foreign.refField}\`) ON UPDATE ${foreign.onUpdate} ON DELETE ${foreign.onDelete}`);
      });

      sql = `${sql} (${[...newColumns, ...newIndexes, ...newForeigns].join(', ')}) COMMENT='${options.comment}', COLLATE='${options.collation}', ENGINE=${options.engine}`;

      await this.raw(sql);
   }

   /**
    * ALTER TABLE
    *
    * @returns {Array.<Object>} parameters
    * @memberof MySQLClient
    */
   async alterTable (params: TableParams) {
      const {
         table,
         schema,
         additions,
         deletions,
         changes,
         indexChanges,
         foreignChanges,
         options
      } = params;

      let sql = `ALTER TABLE \`${schema}\`.\`${table}\` `;
      const alterColumns = [];

      // OPTIONS
      if ('comment' in options) alterColumns.push(`COMMENT='${options.comment}'`);
      if ('engine' in options) alterColumns.push(`ENGINE=${options.engine}`);
      if ('autoIncrement' in options) alterColumns.push(`AUTO_INCREMENT=${options.autoIncrement}`);
      if ('collation' in options) alterColumns.push(`COLLATE='${options.collation}'`);

      // ADD FIELDS
      additions?.forEach(addition => {
         const typeInfo = this._getTypeInfo(addition.type);
         const length = typeInfo.length ? addition.enumValues || addition.numLength || addition.charLength || addition.datePrecision : false;

         alterColumns.push(`ADD COLUMN \`${addition.name}\` 
            ${addition.type.toUpperCase()}${length ? `(${length})` : ''} 
            ${addition.unsigned ? 'UNSIGNED' : ''} 
            ${addition.zerofill ? 'ZEROFILL' : ''}
            ${addition.nullable ? 'NULL' : 'NOT NULL'}
            ${addition.autoIncrement ? 'AUTO_INCREMENT' : ''}
            ${addition.default ? `DEFAULT ${addition.default}` : ''}
            ${addition.comment ? `COMMENT '${addition.comment}'` : ''}
            ${addition.collation ? `COLLATE ${addition.collation}` : ''}
            ${addition.onUpdate ? `ON UPDATE ${addition.onUpdate}` : ''}
            ${addition.after ? `AFTER \`${addition.after}\`` : 'FIRST'}`);
      });

      // ADD INDEX
      indexChanges.additions.forEach(addition => {
         const fields = addition.fields.map(field => `\`${field}\``).join(',');
         let type = addition.type;

         if (type === 'PRIMARY')
            alterColumns.push(`ADD PRIMARY KEY (${fields})`);
         else {
            if (type === 'UNIQUE')
               type = 'UNIQUE INDEX';

            alterColumns.push(`ADD ${type} \`${addition.name}\` (${fields})`);
         }
      });

      // ADD FOREIGN KEYS
      foreignChanges.additions.forEach(addition => {
         alterColumns.push(`ADD CONSTRAINT \`${addition.constraintName}\` FOREIGN KEY (\`${addition.field}\`) REFERENCES \`${addition.refTable}\` (\`${addition.refField}\`) ON UPDATE ${addition.onUpdate} ON DELETE ${addition.onDelete}`);
      });

      // CHANGE FIELDS
      changes?.forEach(change => {
         const typeInfo = this._getTypeInfo(change.type);
         const length = typeInfo.length ? change.enumValues || change.numLength || change.charLength || change.datePrecision : false;

         alterColumns.push(`CHANGE COLUMN \`${change.orgName}\` \`${change.name}\` 
            ${change.type.toUpperCase()}${length ? `(${length})` : ''} 
            ${change.unsigned ? 'UNSIGNED' : ''} 
            ${change.zerofill ? 'ZEROFILL' : ''}
            ${change.nullable ? 'NULL' : 'NOT NULL'}
            ${change.autoIncrement ? 'AUTO_INCREMENT' : ''}
            ${change.default ? `DEFAULT ${change.default}` : ''}
            ${change.comment ? `COMMENT '${change.comment}'` : ''}
            ${change.collation ? `COLLATE ${change.collation}` : ''}
            ${change.onUpdate ? `ON UPDATE ${change.onUpdate}` : ''}
            ${change.after ? `AFTER \`${change.after}\`` : 'FIRST'}`);
      });

      // CHANGE INDEX
      indexChanges.changes.forEach(change => {
         if (change.oldType === 'PRIMARY')
            alterColumns.push('DROP PRIMARY KEY');
         else
            alterColumns.push(`DROP INDEX \`${change.oldName}\``);

         const fields = change.fields.map(field => `\`${field}\``).join(',');
         let type = change.type;

         if (type === 'PRIMARY')
            alterColumns.push(`ADD PRIMARY KEY (${fields})`);
         else {
            if (type === 'UNIQUE')
               type = 'UNIQUE INDEX';

            alterColumns.push(`ADD ${type} \`${change.name}\` (${fields})`);
         }
      });

      // CHANGE FOREIGN KEYS
      foreignChanges.changes.forEach(change => {
         alterColumns.push(`DROP FOREIGN KEY \`${change.oldName}\``);
         alterColumns.push(`ADD CONSTRAINT \`${change.constraintName}\` FOREIGN KEY (\`${change.field}\`) REFERENCES \`${change.refTable}\` (\`${change.refField}\`) ON UPDATE ${change.onUpdate} ON DELETE ${change.onDelete}`);
      });

      // DROP FIELDS
      deletions?.forEach(deletion => {
         alterColumns.push(`DROP COLUMN \`${deletion.name}\``);
      });

      // DROP INDEX
      indexChanges.deletions.forEach(deletion => {
         if (deletion.type === 'PRIMARY')
            alterColumns.push('DROP PRIMARY KEY');
         else
            alterColumns.push(`DROP INDEX \`${deletion.name}\``);
      });

      // DROP FOREIGN KEYS
      foreignChanges?.deletions.forEach(deletion => {
         alterColumns.push(`DROP FOREIGN KEY \`${deletion.constraintName}\``);
      });

      sql += alterColumns.join(', ');

      // RENAME
      if (options.name) sql += `; RENAME TABLE \`${schema}\`.\`${table}\` TO \`${schema}\`.\`${options.name}\``;

      await this.raw(sql);
   }

   /**
    * DUPLICATE TABLE
    *
    * @returns {Array.<Object>} parameters
    * @memberof MySQLClient
    */
   async duplicateTable (params: { schema: string, table: string}) {
      const sql = `CREATE TABLE \`${params.schema}\`.\`${params.table}_copy\` LIKE \`${params.schema}\`.\`${params.table}\``;
      await this.raw(sql);
   }

   /**
    * TRUNCATE TABLE
    *
    * @returns {Array.<Object>} parameters
    * @memberof MySQLClient
    */
   async truncateTable (params: { schema: string, table: string}) {
      const sql = `TRUNCATE TABLE \`${params.schema}\`.\`${params.table}\``;
      await this.raw(sql);
   }

   /**
    * DROP TABLE
    *
    * @returns {Array.<Object>} parameters
    * @memberof MySQLClient
    */
   async dropTable (params: {schema: string, table: string}) {
      const sql = `DROP TABLE \`${params.schema}\`.\`${params.table}\``;
      await this.raw(sql);
   }

   /**
    * @returns {String} SQL string
    * @memberof MySQLClient
    */
   getSQL () {
      // SELECT
      const selectArray = this._query.select.reduce(this._reducer, []);
      let selectRaw = '';

      if (selectArray.length)
         selectRaw = selectArray.length ? `SELECT ${selectArray.join(', ')} ` : 'SELECT * ';

      // FROM
      let fromRaw = '';

      if (!this._query.update.length && !Object.keys(this._query.insert).length && !!this._query.from)
         fromRaw = 'FROM';
      else if (Object.keys(this._query.insert).length)
         fromRaw = 'INTO';

      fromRaw += this._query.from ? ` ${this._query.schema ? `\`${this._query.schema}\`.` : ''}\`${this._query.from}\` ` : '';

      // WHERE
      const whereArray = this._query.where.reduce(this._reducer, []);
      const whereRaw = whereArray.length ? `WHERE ${whereArray.join(' AND ')} ` : '';

      // UPDATE
      const updateArray = this._query.update.reduce(this._reducer, []);
      const updateRaw = updateArray.length ? `SET ${updateArray.join(', ')} ` : '';

      // INSERT
      let insertRaw = '';

      if (this._query.insert.length) {
         const fieldsList = Object.keys(this._query.insert[0]);
         const rowsList = this._query.insert.map(el => `(${Object.values(el).join(', ')})`);

         insertRaw = `(${fieldsList.join(', ')}) VALUES ${rowsList.join(', ')} `;
      }

      // GROUP BY
      const groupByArray = this._query.groupBy.reduce(this._reducer, []);
      const groupByRaw = groupByArray.length ? `GROUP BY ${groupByArray.join(', ')} ` : '';

      // ORDER BY
      const orderByArray = this._query.orderBy.reduce(this._reducer, []);
      const orderByRaw = orderByArray.length ? `ORDER BY ${orderByArray.join(', ')} ` : '';

      // LIMIT
      const limitRaw = this._query.limit.length ? `LIMIT ${this._query.limit.join(', ')} ` : '';

      // OFFSET
      const offsetRaw = this._query.offset.length ? `OFFSET ${this._query.offset.join(', ')} ` : '';

      return `${selectRaw}${updateRaw ? 'UPDATE' : ''}${insertRaw ? 'INSERT ' : ''}${this._query.delete ? 'DELETE ' : ''}${fromRaw}${updateRaw}${whereRaw}${groupByRaw}${orderByRaw}${limitRaw}${offsetRaw}${insertRaw}`;
   }

   /**
    * @param {String} sql raw SQL query
    * @param {QueryArguments=} args
    * @param {String} args.schema
    * @param {Boolean} args.nest
    * @param {Boolean} args.details
    * @param {Boolean} args.split
    * @param {Boolean} args.comments
    * @returns {Promise}
    * @memberof MySQLClient
    */
   async raw (sql: string, args?: QueryArguments): Promise<QueryResult|Array<QueryResult>> {
      if (!this._connection) throw new Error('No connection available');

      if (process.env.NODE_ENV === 'development') this._logger(sql);// TODO: replace BLOB content with a placeholder

      const internalArgs: QueryArguments = {
         nest: false,
         details: false,
         split: true,
         comments: true,
         ...args
      };

      if (!internalArgs.comments)
         sql = sql.replace(/(\/\*(.|[\r\n])*?\*\/)|(--(.*|[\r\n]))/gm, '');// Remove comments

      const nestTables = internalArgs.nest ? '.' : false;
      const resultsArr: Array<QueryResult> = [];
      let paramsArr = [];
      const queries = internalArgs.split
         ? sql.split(/((?:[^;'"]*(?:"(?:\\.|[^"])*"|'(?:\\.|[^'])*')[^;'"]*)+)|;/gm)
            .filter(Boolean)
            .map(q => q.trim())
         : [sql];
      const isPool: boolean = typeof (this._connection as mysql.Pool).getConnection === 'function';
      const connection = isPool ? await (this._connection as mysql.Pool).getConnection() : this._connection;

      if (internalArgs.schema)
         await connection.query(`USE \`${internalArgs.schema}\``);

      for (const query of queries) {
         if (!query) continue;
         const timeStart = new Date();
         let timeStop;
         let keysArr: Array<{[key:string]: number|string}> = [];
         type ExcludesFalse = <T>(x: T | false) => x is T;

         const { rows, report, fields, keys, duration } = await new Promise((resolve, reject) => {
            connection.query({ sql: query, nestTables }).then(async ([response, fields]) => {
               timeStop = new Date();
               const queryResult = response;

               let remappedFields: Array<{[key:string]: number|string|boolean|null}> = fields
                  ? fields.map(field => {
                     if (!field || Array.isArray(field))
                        return false;

                     const type = this._getType(field);
                     const fieldPacket: {[key:string]: number|string|boolean} = {
                        name: field.orgName,
                        alias: field.name,
                        orgName: field.orgName,
                        schema: internalArgs.schema || '',
                        table: field.table,
                        tableAlias: field.table,
                        orgTable: field.orgTable,
                        type: type.name,
                        length: type.length
                     };

                     return fieldPacket;
                  }).filter(Boolean as any as ExcludesFalse)
                  : [];

               if (internalArgs.details) {
                  let cachedTable: string | undefined;

                  if (remappedFields.length) {
                     paramsArr = remappedFields.map(field => {
                        if (field && field.orgTable)
                           cachedTable = (field.orgTable as string);// Needed for some queries on information_schema
                        return {
                           table: field.orgTable || cachedTable,
                           schema: field.schema || 'INFORMATION_SCHEMA'
                        };
                     }).filter((val, i, arr) => arr.findIndex(el => el.schema === val.schema && el.table === val.table) === i);

                     for (const paramObj of (paramsArr as Array<{table: string, schema: string}>)) {
                        if (!paramObj.table || !paramObj.schema) continue;

                        try { // Column details
                           const response = await this.getTableColumns(paramObj);
                           remappedFields = remappedFields.map(field => {
                              const detailedField = response?.find(f => f.name === field.name);
                              if (detailedField && field.orgTable === paramObj.table && field.schema === paramObj.schema)
                                 field = { ...field, ...detailedField };
                              return field;
                           });
                        }
                        catch (err) {
                           if (isPool)
                              (connection as any).release();
                           reject(err);
                        }

                        try { // Key usage (foreign keys)
                           const response = await this.getKeyUsage(paramObj);
                           keysArr = keysArr ? [...keysArr, ...response] : response;
                        }
                        catch (err) {
                           if (isPool)
                              (connection as any).release();
                           reject(err);
                        }
                     }
                  }
               }

               resolve({
                  duration: +timeStop - +timeStart,
                  rows: Array.isArray(queryResult) ? queryResult.some(el => Array.isArray(el)) ? [] : queryResult : false,
                  report: !Array.isArray(queryResult) ? queryResult : false,
                  fields: remappedFields,
                  keys: keysArr
               });
            }).catch((err) => {
               if (isPool)
                  (connection as any).release();
               reject(err);
            });
         });

         resultsArr.push({ rows, report, fields, keys, duration });
      }

      if (isPool)
         (connection as any).release();

      return resultsArr.length === 1 ? resultsArr[0] : resultsArr;
   }
}
