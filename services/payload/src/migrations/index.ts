import * as migration_20260813_141537_schema_initial from './20260813_141537_schema_initial';
import * as migration_20260815_084824_marqueur_demo_et_preparation from './20260815_084824_marqueur_demo_et_preparation';

export const migrations = [
  {
    up: migration_20260813_141537_schema_initial.up,
    down: migration_20260813_141537_schema_initial.down,
    name: '20260813_141537_schema_initial',
  },
  {
    up: migration_20260815_084824_marqueur_demo_et_preparation.up,
    down: migration_20260815_084824_marqueur_demo_et_preparation.down,
    name: '20260815_084824_marqueur_demo_et_preparation'
  },
];
