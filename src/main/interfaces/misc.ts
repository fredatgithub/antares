import SSHConfig from 'ssh2-promise/lib/sshConfig';

export interface DatabaseType {
   name: string,
   length: boolean,
   collation: boolean,
   zerofill: boolean
}

export interface DatabaseTypes {
   group: string,
   types: Array<DatabaseType>
}

export interface ConnectionConfig{
   host: string,
   port: number,
   password: string,
   database?: string,
   user: string,
   schema?: string,
   // eslint-disable-next-line camelcase
   application_name?: string,
   ssl?: {[key: string]: any},
   ssh?: SSHConfig
}

export interface ConnectionArguments {
   client: string,
   params: ConnectionConfig,
   poolSize?: number,
   logger?: Function
}

export interface ColumnPacket {
   name: string,
   type: string,
   length?: number,
   numPrecision?: number,
   charLength?: number,
   datePrecision?: number,
   default: string | null
}

export interface QueryObject {
   schema: string,
   select: Array<string>,
   from: string,
   where: Array<string | {[key: string]: string}>,
   groupBy: Array<string>,
   orderBy: Array<string | {[key: string]: string}>,
   limit: Array<number>,
   offset: Array<number>,
   join: Array<string>,
   update: Array<string>,
   insert: Array<string>,
   delete: boolean
}

export interface QueryArguments {
   schema?: string,
   nest?: boolean,
   details?: boolean,
   split?: boolean,
   comments?: boolean,
   rowMode?: 'array'
}

export interface QueryResult {
   duration?: number,
   rows?: Array<any>
   report?: any | false
   fields: Array<{[key: string]: string | number | boolean}>
   keys: Array<{[key: string]: string | number}>
}

export interface TableParams {
   schema: string,
   table?: string,
   fields: Array<{
      name: string,
      type: string,
      enumValues?: string,
      numLength?: number,
      charLength?: number,
      datePrecision?: number,
      unsigned?: boolean,
      zerofill?: boolean,
      nullable?: boolean,
      autoIncrement?: boolean,
      default?: string,
      comment?: string,
      collation?: string,
      onUpdate?: string
   }>,
   additions?: Array<{
      name: string,
      type: string,
      enumValues?: string,
      numLength?: number,
      charLength?: number,
      datePrecision?: number,
      unsigned?: boolean,
      zerofill?: boolean,
      nullable?: boolean,
      autoIncrement?: boolean,
      isArray?: boolean,
      default?: string,
      comment?: string,
      collation?: string,
      onUpdate?: string,
      after?: string
   }>,
   deletions?: Array<{name: string}>,
   changes?: Array<{
      name: string,
      orgName: string,
      type: string,
      enumValues?: string,
      numLength?: number,
      charLength?: number,
      datePrecision?: number,
      unsigned?: boolean,
      zerofill?: boolean,
      nullable?: boolean,
      autoIncrement?: boolean,
      isArray?: boolean,
      default?: string,
      comment?: string,
      collation?: string,
      onUpdate?: string,
      after?: string
   }>,
   foreigns: Array<{
      constraintName: string,
      field: string,
      refTable: string,
      refField: string,
      onUpdate: string,
      onDelete: string
   }>,
   foreignChanges:{
      additions: Array<{
         constraintName: string,
         field: string,
         refTable: string,
         refField: string,
         onUpdate: string,
         onDelete: string
      }>,
      deletions: Array<{constraintName: string}>
      changes: Array<{
         constraintName: string,
         oldName: string,
         field: string,
         refTable: string,
         refField: string,
         onUpdate: string,
         onDelete: string
      }>
   },
   indexes: Array<{
      name: string,
      type: string,
      fields: Array<string>
   }>,
   indexChanges: {
      additions: Array<{
         name: string,
         type: string,
         fields: Array<string>
      }>,
      deletions: Array<{
         name: string,
         type: string
      }>
      changes: Array<{
         name: string,
         oldName: string,
         type: string,
         oldType: string,
         fields: Array<string>
      }>
   },
   options: {
      name: string,
      comment?: string,
      collation?: string,
      engine?: string,
      autoIncrement?: string
   }
}
export interface ViewParams {
   schema: string,
   name: string,
   algorithm: string,
   definer: string
   oldName: string,
   sql: string,
   updateOption?: string,
   security: string
}

export interface TriggerParams {
   definer: string,
   schema: string,
   name: string,
   oldName: string,
   activation: string,
   event: string,
   table: string,
   sql: string
}

export interface RoutineParams {
   schema: string,
   name: string,
   oldName: string,
   definer?: string,
   deterministic: string,
   dataAccess: string,
   security: string,
   comment: string,
   language?: string,
   sql: string,
   parameters: Array<{
      context: string,
      name: string,
      type: string,
      length?: string
   }>
}

export interface FunctionParams {
   schema: string,
   name: string,
   oldName: string,
   definer?: string,
   deterministic: string,
   dataAccess: string,
   security: string,
   comment: string,
   language?: string,
   sql: string,
   returns?: boolean,
   returnsLength?: number,
   parameters: Array<{
      context: string,
      name: string,
      type: string,
      length?: string
   }>
}

export interface SchedulerParams {
   execution: string,
   definer: string,
   schema: string,
   every: Array<string>
   starts: string,
   ends: string,
   at: string,
   preserve: boolean,
   name: string,
   oldName: string,
   comment: string,
   state: string,
   sql: string
}
