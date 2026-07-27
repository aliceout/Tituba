import * as migration_20260725_222510_initial_schema from './20260725_222510_initial_schema';
import * as migration_20260727_101725_auto_20260727_121512 from './20260727_101725_auto_20260727_121512';

export const migrations = [
  {
    up: migration_20260725_222510_initial_schema.up,
    down: migration_20260725_222510_initial_schema.down,
    name: '20260725_222510_initial_schema',
  },
  {
    up: migration_20260727_101725_auto_20260727_121512.up,
    down: migration_20260727_101725_auto_20260727_121512.down,
    name: '20260727_101725_auto_20260727_121512'
  },
];
