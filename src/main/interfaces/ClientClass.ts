import { Core } from '../interfaces/Core';
import {
   ColumnPacket,
   QueryArguments,
   QueryResult,
   TableParams,
   ViewParams,
   TriggerParams,
   RoutineParams,
   FunctionParams,
   SchedulerParams
} from './misc';

export interface ClientClass extends Core {
   types: { [key: number]: string };

   connect(): Promise<void>;

   destroy(): void;

   use(schema: string): Promise<void>;

   getStructure(schemas: Set<string>): Promise<any>;

   getTableColumns({ schema, table }: { schema: string, table: string }, arrayRemap?: boolean): Promise<Array<ColumnPacket> | undefined>;

   getTableApproximateCount({ schema, table }: { schema: string, table: string }): Promise<number>

   getTableOptions({ schema, table }: { schema: string, table: string }): Promise<any>

   getTableIndexes({ schema, table }: { schema: string, table: string }): Promise<any>

   getKeyUsage({ schema, table }: { schema: string, table: string }): Promise<any>

   getUsers(): Promise<any>;

   createSchema(params: { name: string, collation: string }): Promise<void>;

   alterSchema(params: { name: string, collation: string }): Promise<void>;

   dropSchema(params: { database: string }): Promise<void>;

   getDatabaseCollation?(params: { database: string }): Promise<QueryResult>;

   getViewInformations({ schema, view }: { schema: string, view: string }): Promise<{
      algorithm: any;
      definer: any;
      security: any;
      updateOption: any;
      sql: any;
      name: any;
   } | undefined>;

   dropView(params: { schema: string, view: string }): Promise<void>;

   alterView(params: { view: ViewParams }): Promise<void>;

   createView(params: ViewParams): Promise<void>

   getTriggerInformations({ schema, trigger }: { schema: string, trigger: string }): Promise<{
      definer?: string;
      sql: string;
      name: string;
      table: string;
      activation: string;
      event: string | Array<string>;
   } | undefined>

   dropTrigger(params: { schema: string, trigger: string }): Promise<void>

   alterTrigger(params: { trigger: TriggerParams }): Promise<void>

   createTrigger(params: TriggerParams): Promise<void>

   alterTriggerFunction? (params: {func: FunctionParams}): Promise<void>;

   createTriggerFunction? (func: FunctionParams): Promise<void>;

   getRoutineInformations({ schema, routine }: { schema: string, routine: string }): Promise<{
      definer: any;
      sql: any;
      parameters: {
         name: any;
         type: any;
         length: any;
         context: any;
      }[];
      name: any;
      comment: any;
      security: string;
      deterministic?: boolean;
      dataAccess?: string;
      language?: string
   } | undefined>

   dropRoutine(params: { schema: string, routine: string }): Promise<void>

   alterRoutine(params: { routine: RoutineParams }): Promise<void>

   createRoutine(params: RoutineParams): Promise<void>

   getFunctionInformations({ schema, func }: { schema: string, func: string }): Promise<any>

   dropFunction(params: { schema: string, func: string }): Promise<void>

   alterFunction(params: { func: FunctionParams }): Promise<void>

   createFunction(params: FunctionParams): Promise<void>

   getEventInformations?({ schema, scheduler }: { schema: string, scheduler: string }): Promise<{
      definer: string;
      sql: string;
      name: string;
      comment: string;
      state: string;
      preserve: boolean;
      execution: string;
      every: string;
      starts: string;
      ends: string;
      at: string;
   } | undefined>

   dropEvent?(params: { schema: string, scheduler: string }): Promise<void>

   alterEvent?(params: { scheduler: SchedulerParams }): Promise<void>

   createEvent?(params: SchedulerParams): Promise<void>

   getCollations?(): Promise<{
      charset: string;
      collation: string;
      compiled: string;
      default: string;
      id: number;
      sortLen: number;
   }[] | undefined>

   getVariables(): Promise<{
      name: string;
      value: string;
   }[] | undefined>

   getEngines(): Promise<{
      name: string;
      support: string;
      comment: string;
      transactions?: string;
      xa?: string;
      savepoints?: string;
      isDefault: boolean;
   }[] | undefined>

   getVersion(): Promise<{
      [key: string]: string;
   } | undefined>

   getProcesses(): Promise<{
      id: number;
      user: string;
      host: string;
      database: string;
      command?: string;
      time: number;
      state: string;
      info: string;
      application?: string
   }[] | undefined>

   createTable(params: TableParams): Promise<void>

   alterTable(params: TableParams): Promise<void>

   duplicateTable(params: { schema: string, table: string }): Promise<void>

   truncateTable(params: { schema: string, table: string }): Promise<void>

   dropTable(params: { schema: string, table: string }): Promise<void>

   getSQL(): string

   raw(sql: string, args?: QueryArguments): Promise<QueryResult | Array<QueryResult>>
}
