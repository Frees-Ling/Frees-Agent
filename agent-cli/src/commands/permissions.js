import { buildPermissionGuide } from '../system/permissions.js';

export async function runPermissionsCommand() {
  const guide = buildPermissionGuide();
  console.log(`平台: ${guide.platform}`);
  console.log(guide.summary);
  console.log('');
  console.log('建议步骤:');
  for (const step of guide.steps) {
    console.log(`- ${step}`);
  }
  if (guide.links.length) {
    console.log('');
    console.log('参考链接:');
    for (const link of guide.links) {
      console.log(`- ${link.title}: ${link.url}`);
    }
  }
}
