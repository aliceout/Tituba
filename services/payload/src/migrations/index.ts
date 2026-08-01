import * as migration_20260725_222510_initial_schema from './20260725_222510_initial_schema';
import * as migration_20260727_101725_auto_20260727_121512 from './20260727_101725_auto_20260727_121512';
import * as migration_20260727_135144_une_et_disposition from './20260727_135144_une_et_disposition';
import * as migration_20260729_131257_auto_20260729_151037 from './20260729_131257_auto_20260729_151037';
import * as migration_20260730_232929 from './20260730_232929';
import * as migration_20260731_095514 from './20260731_095514';
import * as migration_20260731_153800 from './20260731_153800';
import * as migration_20260731_170331 from './20260731_170331';
import * as migration_20260801_213500 from './20260801_213500';

export const migrations = [
  {
    up: migration_20260725_222510_initial_schema.up,
    down: migration_20260725_222510_initial_schema.down,
    name: '20260725_222510_initial_schema',
  },
  {
    up: migration_20260727_101725_auto_20260727_121512.up,
    down: migration_20260727_101725_auto_20260727_121512.down,
    name: '20260727_101725_auto_20260727_121512',
  },
  {
    up: migration_20260727_135144_une_et_disposition.up,
    down: migration_20260727_135144_une_et_disposition.down,
    name: '20260727_135144_une_et_disposition',
  },
  {
    up: migration_20260729_131257_auto_20260729_151037.up,
    down: migration_20260729_131257_auto_20260729_151037.down,
    name: '20260729_131257_auto_20260729_151037',
  },
  {
    up: migration_20260730_232929.up,
    down: migration_20260730_232929.down,
    name: '20260730_232929',
  },
  {
    up: migration_20260731_095514.up,
    down: migration_20260731_095514.down,
    name: '20260731_095514',
  },
  {
    up: migration_20260731_153800.up,
    down: migration_20260731_153800.down,
    name: '20260731_153800',
  },
  {
    up: migration_20260731_170331.up,
    down: migration_20260731_170331.down,
    name: '20260731_170331',
  },
  {
    up: migration_20260801_213500.up,
    down: migration_20260801_213500.down,
    name: '20260801_213500'
  },
];
