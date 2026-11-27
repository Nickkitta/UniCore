import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import type { PhotoDraft } from '@unicore/shared';

export async function pickPhotos(remaining: number): Promise<PhotoDraft[]> {
  if (remaining <= 0) return [];
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: true,
    selectionLimit: remaining,
    quality: 1,
  });
  if (result.canceled) return [];
  const photos: PhotoDraft[] = [];
  for (const asset of result.assets.slice(0, remaining)) {
    const context = ImageManipulator.manipulate(asset.uri);
    if (Math.max(asset.width, asset.height) > 1600) {
      context.resize(asset.width >= asset.height ? { width: 1600 } : { height: 1600 });
    }
    const rendered = await context.renderAsync();
    try {
      const image = await rendered.saveAsync({
        format: SaveFormat.JPEG,
        compress: 0.8,
        base64: true,
      });
      if (!image.base64 || image.base64.length > 6990508)
        throw new Error('Не удалось подготовить фото — выбери изображение меньше 5 МБ');
      photos.push({ uri: image.uri, base64: image.base64 });
    } finally {
      rendered.release();
      context.release();
    }
  }
  return photos;
}
