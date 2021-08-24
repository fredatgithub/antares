import { SslOptions } from 'mysql2';
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

export interface ConnectionArguments {
   client: string,
   params: {
      host: string,
      port: number,
      password: string,
      database?: string,
      user: string,
      schema?: string,
      applicationName?: string,
      ssl: SslOptions,
      ssh: SSHConfig
   },
   poolSize?: number,
   logger: Function
}

export interface QueryObject {
   schema: string,
   select: Array<string>,
   from: string,
   where: Array<string>,
   groupBy: Array<string>,
   orderBy: Array<string>,
   limit: Array<string>,
   offset: Array<string>,
   join: Array<string>,
   update: Array<string>,
   insert: Array<string>,
   delete: boolean
}

export interface QueryArguments {
   schema?: string,
   nest: boolean,
   details: boolean,
   split: boolean,
   comments: boolean
}
