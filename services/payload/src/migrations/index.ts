import * as migration_20260725_222510_initial_schema from './20260725_222510_initial_schema';
import * as migration_20260727_101725_auto_20260727_121512 from './20260727_101725_auto_20260727_121512';
import * as migration_20260727_135144_une_et_disposition from './20260727_135144_une_et_disposition';
import * as migration_20260729_131257_auto_20260729_151037 from './20260729_131257_auto_20260729_151037';
import * as migration_20260730_232929 from './20260730_232929';
import * as migration_20260731_095514 from './20260731_095514';
import * as migration_20260731_153800 from './20260731_153800';
import * as migration_20260731_170331 from './20260731_170331';
import * as migration_20260801_213500 from './20260801_213500';
import * as migration_20260803_084631_podcast_drop_legacy from './20260803_084631_podcast_drop_legacy';
import * as migration_20260803_084852_podcast_audio from './20260803_084852_podcast_audio';
import * as migration_20260803_120008_podcast_cover from './20260803_120008_podcast_cover';
import * as migration_20260804_110821_series from './20260804_110821_series';
import * as migration_20260804_121249_audio_dans_media from './20260804_121249_audio_dans_media';
import * as migration_20260804_143004_pages_fixes from './20260804_143004_pages_fixes';
import * as migration_20260804_153037_categorie_figee from './20260804_153037_categorie_figee';
import * as migration_20260804_153717_series_themes from './20260804_153717_series_themes';
import * as migration_20260804_165235_actus_image from './20260804_165235_actus_image';
import * as migration_20260805_091529_actus_en_bref from './20260805_091529_actus_en_bref';
import * as migration_20260805_130139_auteurice_profil from './20260805_130139_auteurice_profil';

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
    name: '20260801_213500',
  },
  {
    up: migration_20260803_084631_podcast_drop_legacy.up,
    down: migration_20260803_084631_podcast_drop_legacy.down,
    name: '20260803_084631_podcast_drop_legacy',
  },
  {
    up: migration_20260803_084852_podcast_audio.up,
    down: migration_20260803_084852_podcast_audio.down,
    name: '20260803_084852_podcast_audio',
  },
  {
    up: migration_20260803_120008_podcast_cover.up,
    down: migration_20260803_120008_podcast_cover.down,
    name: '20260803_120008_podcast_cover',
  },
  {
    up: migration_20260804_110821_series.up,
    down: migration_20260804_110821_series.down,
    name: '20260804_110821_series',
  },
  {
    up: migration_20260804_121249_audio_dans_media.up,
    down: migration_20260804_121249_audio_dans_media.down,
    name: '20260804_121249_audio_dans_media',
  },
  {
    up: migration_20260804_143004_pages_fixes.up,
    down: migration_20260804_143004_pages_fixes.down,
    name: '20260804_143004_pages_fixes',
  },
  {
    up: migration_20260804_153037_categorie_figee.up,
    down: migration_20260804_153037_categorie_figee.down,
    name: '20260804_153037_categorie_figee',
  },
  {
    up: migration_20260804_153717_series_themes.up,
    down: migration_20260804_153717_series_themes.down,
    name: '20260804_153717_series_themes',
  },
  {
    up: migration_20260804_165235_actus_image.up,
    down: migration_20260804_165235_actus_image.down,
    name: '20260804_165235_actus_image',
  },
  {
    up: migration_20260805_091529_actus_en_bref.up,
    down: migration_20260805_091529_actus_en_bref.down,
    name: '20260805_091529_actus_en_bref',
  },
  {
    up: migration_20260805_130139_auteurice_profil.up,
    down: migration_20260805_130139_auteurice_profil.down,
    name: '20260805_130139_auteurice_profil'
  },
];
