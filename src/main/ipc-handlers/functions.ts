import { ipcMain } from 'electron';
import { ClientClass } from '../interfaces/ClientClass';

export default (connections: {[key: string]: ClientClass}) => {
   ipcMain.handle('get-function-informations', async (event, params) => {
      try {
         const result = await connections[params.uid].getFunctionInformations(params);
         return { status: 'success', response: result };
      }
      catch (err) {
         return { status: 'error', response: err.toString() };
      }
   });

   ipcMain.handle('drop-function', async (event, params) => {
      try {
         await connections[params.uid].dropFunction(params);
         return { status: 'success' };
      }
      catch (err) {
         return { status: 'error', response: err.toString() };
      }
   });

   ipcMain.handle('alter-function', async (event, params) => {
      try {
         await connections[params.uid].alterFunction(params);
         return { status: 'success' };
      }
      catch (err) {
         return { status: 'error', response: err.toString() };
      }
   });

   ipcMain.handle('alter-trigger-function', async (event, params) => {
      try {
         await (connections[params.uid] as any).alterTriggerFunction(params);
         return { status: 'success' };
      }
      catch (err) {
         return { status: 'error', response: err.toString() };
      }
   });

   ipcMain.handle('create-function', async (event, params) => {
      try {
         await connections[params.uid].createFunction(params);
         return { status: 'success' };
      }
      catch (err) {
         return { status: 'error', response: err.toString() };
      }
   });

   ipcMain.handle('create-trigger-function', async (event, params) => {
      try {
         await (connections[params.uid] as any).createTriggerFunction(params);
         return { status: 'success' };
      }
      catch (err) {
         return { status: 'error', response: err.toString() };
      }
   });
};
