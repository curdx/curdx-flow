import * as p from '@clack/prompts';
import { t } from '../i18n/index.ts';
import { installFlow } from '../flows/install.ts';
import { uninstallFlow } from '../flows/uninstall.ts';
import { updateFlow } from '../flows/update.ts';
import { statusFlow } from '../flows/status.ts';

type Choice = 'install' | 'update' | 'uninstall' | 'status' | 'exit';

export async function mainMenu(): Promise<void> {
  const action = await p.select<Choice>({
    message: t('menu.title'),
    options: [
      { value: 'install', label: t('menu.install') },
      { value: 'update', label: t('menu.update') },
      { value: 'uninstall', label: t('menu.uninstall') },
      { value: 'status', label: t('menu.status') },
      { value: 'exit', label: t('menu.exit') },
    ],
  });

  if (p.isCancel(action) || action === 'exit') {
    p.cancel(t('app.cancelled'));
    return;
  }

  switch (action) {
    case 'install':
      await installFlow();
      break;
    case 'update':
      await updateFlow();
      break;
    case 'uninstall':
      await uninstallFlow();
      break;
    case 'status':
      await statusFlow();
      break;
  }
}
