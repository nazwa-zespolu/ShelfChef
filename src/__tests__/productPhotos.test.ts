import {PermissionsAndroid, Platform} from 'react-native';
import {launchCamera, launchImageLibrary} from 'react-native-image-picker';
import {copyFile, mkdir} from '@dr.pogodin/react-native-fs';
import {selectProductPhoto} from '../infrastructure/productPhotos';

jest.mock('react-native-image-picker', () => ({launchCamera: jest.fn(), launchImageLibrary: jest.fn()}));
jest.mock('@dr.pogodin/react-native-fs', () => ({
  DocumentDirectoryPath: '/documents', mkdir: jest.fn(), copyFile: jest.fn(),
  exists: jest.fn().mockResolvedValue(true), unlink: jest.fn().mockResolvedValue(undefined),
}));

describe('Product photo camera permissions', () => {
  const check = jest.spyOn(PermissionsAndroid, 'check');
  const request = jest.spyOn(PermissionsAndroid, 'request');
  let restorePlatform: () => void;

  beforeEach(() => {
    const replacement = jest.replaceProperty(Platform, 'OS', 'android');
    restorePlatform = () => replacement.restore();
    check.mockReset().mockResolvedValue(true);
    request.mockReset().mockResolvedValue(PermissionsAndroid.RESULTS.GRANTED);
    jest.mocked(launchCamera).mockReset().mockResolvedValue({didCancel: true});
    jest.mocked(launchImageLibrary).mockReset().mockResolvedValue({didCancel: true});
    jest.mocked(mkdir).mockReset().mockResolvedValue(undefined);
    jest.mocked(copyFile).mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => restorePlatform());
  afterAll(() => { check.mockRestore(); request.mockRestore(); });

  it('launches the camera without requesting a permission that is already granted', async () => {
    expect(await selectProductPhoto('camera')).toBeNull();

    expect(check).toHaveBeenCalledWith(PermissionsAndroid.PERMISSIONS.CAMERA);
    expect(request).not.toHaveBeenCalled();
    expect(launchCamera).toHaveBeenCalledTimes(1);
  });

  it('waits for permission before launching the camera and storing the selected photo', async () => {
    let grant!: (result: typeof PermissionsAndroid.RESULTS.GRANTED) => void;
    check.mockResolvedValue(false);
    request.mockReturnValue(new Promise(resolve => { grant = resolve; }));
    jest.mocked(launchCamera).mockResolvedValue({assets: [{uri: 'file:///temporary/camera.jpg'}]});

    const selection = selectProductPhoto('camera');
    await Promise.resolve();

    expect(request).toHaveBeenCalledWith(PermissionsAndroid.PERMISSIONS.CAMERA);
    expect(launchCamera).not.toHaveBeenCalled();
    expect(copyFile).not.toHaveBeenCalled();
    grant(PermissionsAndroid.RESULTS.GRANTED);
    const storedUri = await selection;
    expect(launchCamera).toHaveBeenCalledTimes(1);
    expect(copyFile).toHaveBeenCalledWith('file:///temporary/camera.jpg', expect.any(String));
    expect(storedUri).toBe(`file://${jest.mocked(copyFile).mock.calls[0][1]}`);
  });

  it.each([
    [PermissionsAndroid.RESULTS.DENIED, 'denied'],
    [PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN, 'blocked'],
  ] as const)('does not launch or copy a photo when permission is %s', async (result, code) => {
    check.mockResolvedValue(false);
    request.mockResolvedValue(result);

    await expect(selectProductPhoto('camera')).rejects.toMatchObject({code});

    expect(launchCamera).not.toHaveBeenCalled();
    expect(copyFile).not.toHaveBeenCalled();
  });

  it.each(['check', 'request'] as const)('reports a Polish error if the permission %s fails', async operation => {
    check.mockResolvedValue(false);
    if (operation === 'check') { check.mockRejectedValueOnce(new Error('Native check failure')); }
    else { request.mockRejectedValueOnce(new Error('Native request failure')); }

    await expect(selectProductPhoto('camera')).rejects.toThrow('Nie udało się sprawdzić dostępu do aparatu. Spróbuj ponownie.');

    expect(launchCamera).not.toHaveBeenCalled();
    expect(copyFile).not.toHaveBeenCalled();
  });

  it('opens the gallery without checking or requesting camera permission', async () => {
    check.mockResolvedValue(false);
    request.mockResolvedValue(PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN);

    expect(await selectProductPhoto('library')).toBeNull();

    expect(check).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
    expect(launchImageLibrary).toHaveBeenCalledTimes(1);
  });

  it('lets the native iOS picker handle permission and reports a blocked camera in Polish', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    jest.mocked(launchCamera).mockResolvedValue({errorCode: 'permission', errorMessage: 'Camera permission denied'});

    await expect(selectProductPhoto('camera')).rejects.toMatchObject({
      code: 'blocked', message: 'Dostęp do aparatu jest zablokowany. Włącz go w ustawieniach aplikacji.',
    });

    expect(check).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
    expect(launchCamera).toHaveBeenCalledTimes(1);
  });

  it('does not expose native technical error messages to the user', async () => {
    jest.mocked(launchCamera).mockResolvedValue({errorCode: 'others', errorMessage: 'This library does not require Manifest.permission.CAMERA'});

    await expect(selectProductPhoto('camera')).rejects.toThrow('Nie udało się dodać zdjęcia');
  });
});
