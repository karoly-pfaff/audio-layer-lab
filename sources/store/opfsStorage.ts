const OPFS_DIRECTORY = 'audio-assets';

export function storageManager(): StorageManager | null {
  return typeof navigator !== 'undefined' && navigator.storage ? navigator.storage : null;
}

async function opfsDirectory(create: boolean): Promise<FileSystemDirectoryHandle | null> {
  const manager = storageManager();
  if (!manager?.getDirectory) {
    return null;
  }
  try {
    const root = await manager.getDirectory();
    return await root.getDirectoryHandle(OPFS_DIRECTORY, { create });
  } catch {
    return null;
  }
}

export async function writeOpfsFile(opfsName: string, file: File): Promise<boolean> {
  const directory = await opfsDirectory(true);
  if (!directory) {
    return false;
  }
  const handle = await directory.getFileHandle(opfsName, { create: true });
  const writable = await handle.createWritable();
  await writable.write(file);
  await writable.close();
  return true;
}

export async function readOpfsFile(opfsName: string): Promise<File | null> {
  const directory = await opfsDirectory(false);
  if (!directory) {
    return null;
  }
  try {
    return await (await directory.getFileHandle(opfsName)).getFile();
  } catch {
    return null;
  }
}

export async function removeOpfsFile(opfsName: string): Promise<void> {
  try {
    const directory = await opfsDirectory(false);
    if (directory) {
      await directory.removeEntry(opfsName);
    }
  } catch {
    // Missing files are already removed.
  }
}
