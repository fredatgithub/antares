import { QueryArguments } from '../interfaces/misc';

export interface Core {
   _client: string;

   schema(schema: string): this

   select(...args: Array<string>): this

   from(table: string): this

   into(table: string): this

   delete(table: string): this

   where(...args: Array<string | { [key: string]: string }>): this

   groupBy(...args: Array<string>): this

   orderBy(...args: Array<string | { [key: string]: string }>): this

   limit(...args: Array<number>): this

   offset(...args: Array<number>): this

   update(...args: Array<string | {[key: string]: string}>): this

   insert(arr: Array<string>): this

   run(args?: QueryArguments): Promise<any>
}
