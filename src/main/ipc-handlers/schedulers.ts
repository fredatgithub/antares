import { ipcMain } from 'electron';
import { ClientClass } from '../interfaces/ClientClass';

export default (connections: {[key: string]: ClientClass}) => {
   ipcMain.handle('get-scheduler-informations', async (event, params) => {
      try {
         const result = await (connections[params.uid] as any).getEventInformations(params);
         return { status: 'success', response: result };
      }
      catch (err) {
         return { status: 'error', response: err.toString() };
      }
   });

   ipcMain.handle('drop-scheduler', async (event, params) => {
      try {
         await (connections[params.uid] as any).dropEvent(params);
         return { status: 'success' };
      }
      catch (err) {
         return { status: 'error', response: err.toString() };
      }
   });

   ipcMain.handle('alter-scheduler', async (event, params) => {
      try {
         await (connections[params.uid] as any).alterEvent(params);
         return { status: 'success' };
      }
      catch (err) {
         return { status: 'error', response: err.toString() };
      }
   });

   ipcMain.handle('create-scheduler', async (event, params) => {
      try {
         await (connections[params.uid] as any).createEvent(params);
         return { status: 'success' };
      }
      catch (err) {
         return { status: 'error', response: err.toString() };
      }
   });
};
