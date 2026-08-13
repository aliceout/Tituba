import * as migration_20260813_141537_schema_initial from './20260813_141537_schema_initial';

export const migrations = [
  {
    up: migration_20260813_141537_schema_initial.up,
    down: migration_20260813_141537_schema_initial.down,
    name: '20260813_141537_schema_initial'
  },
];
