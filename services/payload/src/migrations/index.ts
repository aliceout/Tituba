import * as migration_20260508_140051_initial_schema from './20260508_140051_initial_schema';
import * as migration_20260508_143538_auto_20260508_173532 from './20260508_143538_auto_20260508_173532';
import * as migration_20260508_144416_auto_20260508_174408 from './20260508_144416_auto_20260508_174408';
import * as migration_20260508_160719 from './20260508_160719';
import * as migration_20260508_162340_auto_20260508_192333 from './20260508_162340_auto_20260508_192333';
import * as migration_20260508_170130_auto_20260508_200122 from './20260508_170130_auto_20260508_200122';
import * as migration_20260508_214735_backfill from './20260508_214735_backfill';
import * as migration_20260510_161341_auto_20260510_191333 from './20260510_161341_auto_20260510_191333';
import * as migration_20260510_175000_posts_search_vector from './20260510_175000_posts_search_vector';
import * as migration_20260510_180000_posts_search_vector_backfill from './20260510_180000_posts_search_vector_backfill';
import * as migration_20260511_161012 from './20260511_161012';

export const migrations = [
  {
    up: migration_20260508_140051_initial_schema.up,
    down: migration_20260508_140051_initial_schema.down,
    name: '20260508_140051_initial_schema',
  },
  {
    up: migration_20260508_143538_auto_20260508_173532.up,
    down: migration_20260508_143538_auto_20260508_173532.down,
    name: '20260508_143538_auto_20260508_173532',
  },
  {
    up: migration_20260508_144416_auto_20260508_174408.up,
    down: migration_20260508_144416_auto_20260508_174408.down,
    name: '20260508_144416_auto_20260508_174408',
  },
  {
    up: migration_20260508_160719.up,
    down: migration_20260508_160719.down,
    name: '20260508_160719',
  },
  {
    up: migration_20260508_162340_auto_20260508_192333.up,
    down: migration_20260508_162340_auto_20260508_192333.down,
    name: '20260508_162340_auto_20260508_192333',
  },
  {
    up: migration_20260508_170130_auto_20260508_200122.up,
    down: migration_20260508_170130_auto_20260508_200122.down,
    name: '20260508_170130_auto_20260508_200122',
  },
  {
    up: migration_20260508_214735_backfill.up,
    down: migration_20260508_214735_backfill.down,
    name: '20260508_214735_backfill',
  },
  {
    up: migration_20260510_161341_auto_20260510_191333.up,
    down: migration_20260510_161341_auto_20260510_191333.down,
    name: '20260510_161341_auto_20260510_191333',
  },
  {
    up: migration_20260510_175000_posts_search_vector.up,
    down: migration_20260510_175000_posts_search_vector.down,
    name: '20260510_175000_posts_search_vector',
  },
  {
    up: migration_20260510_180000_posts_search_vector_backfill.up,
    down: migration_20260510_180000_posts_search_vector_backfill.down,
    name: '20260510_180000_posts_search_vector_backfill',
  },
  {
    up: migration_20260511_161012.up,
    down: migration_20260511_161012.down,
    name: '20260511_161012',
  },
];
