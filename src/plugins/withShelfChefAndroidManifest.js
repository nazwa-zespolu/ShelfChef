/**
 * Android manifest entries that `app.json` cannot express on its own:
 * - the camera is optional (`required="false"`), so devices without one can still
 *   install the app; the CAMERA permission would otherwise imply it is required,
 * - READ_EXTERNAL_STORAGE is only requested up to Android 12L (API 32); newer
 *   versions use READ_MEDIA_IMAGES / READ_MEDIA_VISUAL_USER_SELECTED.
 */
const {withAndroidManifest} = require('expo/config-plugins');

function upsert(list, name, attributes) {
  const existing = list.find(item => item.$['android:name'] === name);
  if (existing) {
    Object.assign(existing.$, attributes);
  } else {
    list.push({$: {'android:name': name, ...attributes}});
  }
}

module.exports = function withShelfChefAndroidManifest(config) {
  return withAndroidManifest(config, mod => {
    const manifest = mod.modResults.manifest;
    manifest['uses-feature'] = manifest['uses-feature'] ?? [];
    manifest['uses-permission'] = manifest['uses-permission'] ?? [];

    upsert(manifest['uses-feature'], 'android.hardware.camera', {
      'android:required': 'false',
    });
    upsert(manifest['uses-permission'], 'android.permission.READ_EXTERNAL_STORAGE', {
      'android:maxSdkVersion': '32',
    });
    return mod;
  });
};
