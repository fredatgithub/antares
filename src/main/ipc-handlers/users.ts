import { ipcMain } from 'electron';
import { ClientClass } from '../interfaces/ClientClass';

export default (connections: {[key: string]: ClientClass}) => {
   ipcMain.handle('get-users', async (event, uid) => {
      try {
         const result = await connections[uid].getUsers();
         return { status: 'success', response: result };
      }
      catch (err) {
         if (err.code === 'ER_TABLEACCESS_DENIED_ERROR')
            return { status: 'success', response: [] };
         return { status: 'error', response: err.toString() };
      }
   });
};
