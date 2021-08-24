import { ipcMain } from 'electron';
import { autoUpdater } from 'electron-updater';
import Store from 'electron-store';
import log from 'electron-log';
const persistentStore = new Store({ name: 'settings' });

let mainWindow: Electron.IpcMainEvent | null;
autoUpdater.allowPrerelease = !!persistentStore.get('allow_prerelease', true);

export default () => {
   ipcMain.on('check-for-updates', event => {
      mainWindow = event;
      if (process.windowsStore || (process.platform === 'linux' && !process.env.APPIMAGE))
         mainWindow.reply('no-auto-update');
      else {
         autoUpdater.checkForUpdatesAndNotify().catch(() => {
            if (mainWindow)
               mainWindow.reply('check-failed');
         });
      }
   });

   ipcMain.on('restart-to-update', () => {
      autoUpdater.quitAndInstall();
   });

   // auto-updater events
   autoUpdater.on('checking-for-update', () => {
      if (mainWindow)
         mainWindow.reply('checking-for-update');
   });

   autoUpdater.on('update-available', () => {
      if (mainWindow)
         mainWindow.reply('update-available');
   });

   autoUpdater.on('update-not-available', () => {
      if (mainWindow)
         mainWindow.reply('update-not-available');
   });

   autoUpdater.on('download-progress', data => {
      if (mainWindow)
         mainWindow.reply('download-progress', data);
   });

   autoUpdater.on('update-downloaded', () => {
      if (mainWindow)
         mainWindow.reply('update-downloaded');
   });

   log.transports.file.level = 'info';
   log.transports.console.format = '{h}:{i}:{s} {text}';
   autoUpdater.logger = log;
};
