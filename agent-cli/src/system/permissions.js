export function buildPermissionGuide() {
  const platform = process.platform;

  if (platform === 'darwin') {
    return {
      platform: 'macOS',
      summary:
        'Frees Agent 当前不能替你静默提权。涉及控制电脑、操作其他应用、读取更多系统文件时，需要你在系统设置里手动授权。',
      steps: [
        '如果未来要让 Frees Agent 控制鼠标、键盘或其他应用，请先在“系统设置 > 隐私与安全性 > 辅助功能”里允许终端或未来的 Frees Agent 应用。',
        '如果未来要让 Frees Agent 控制其他应用，请在“系统设置 > 隐私与安全性 > 自动化”里打开对应权限。',
        '如果未来要访问更多系统级文件，请在“系统设置 > 隐私与安全性 > 完全磁盘访问权限”里授权。',
        '只给你信任的应用授权，尤其是辅助功能和完全磁盘访问权限。'
      ],
      links: [
        {
          title: 'Apple: Allow accessibility apps to access your Mac',
          url: 'https://support.apple.com/guide/mac-help/-mh43185/mac'
        },
        {
          title: 'Apple: Allow apps to control other apps on Mac',
          url: 'https://support.apple.com/guide/mac-help/allow-apps-to-control-other-apps-on-mac-mchl07817563/mac'
        },
        {
          title: 'Apple: Full Disk Access / system configuration files',
          url: 'https://support.apple.com/guide/mac-help/allow-access-to-system-configuration-files-mchlccb25729/mac'
        }
      ]
    };
  }

  if (platform === 'win32') {
    return {
      platform: 'Windows',
      summary:
        'Frees Agent 当前不能替你绕过 Windows 安全策略。涉及脚本执行、设备访问和未来的电脑控制能力时，需要你在系统设置或 PowerShell 中手动确认。',
      steps: [
        '如果未来要使用麦克风、摄像头等能力，请在“设置 > 隐私和安全性”里打开对应权限。',
        '如果未来要运行 PowerShell 脚本，先检查执行策略；常见可用策略是 CurrentUser 作用域下的 RemoteSigned。',
        '如果未来需要更高权限的系统操作，建议使用“以管理员身份运行”启动终端，但只在确实需要时这样做。',
        'Windows 桌面应用的很多权限不能完全由隐私页细粒度控制，因此更要注意只信任你自己的可执行文件。'
      ],
      links: [
        {
          title: 'Microsoft: App permissions',
          url: 'https://support.microsoft.com/en-us/windows/app-permissions-aea98a7c-b61a-1930-6ed0-47f0ed2ee15c'
        },
        {
          title: 'Microsoft: Camera permissions',
          url: 'https://support.microsoft.com/en-us/windows/manage-app-permissions-for-a-camera-in-windows-87ebc757-1f87-7bbf-84b5-0686afb6ca6b'
        },
        {
          title: 'Microsoft Learn: PowerShell execution policies',
          url: 'https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_execution_policies'
        }
      ]
    };
  }

  return {
    platform: process.platform,
    summary:
      '当前平台没有专门的权限引导模板。原则上，Frees Agent 不会替你静默提权，任何系统级能力都建议通过手动授权方式开启。',
    steps: [
      '仅对信任的终端或应用授权。',
      '电脑控制、辅助功能、磁盘访问、脚本执行这类权限都应单独评估。'
    ],
    links: []
  };
}
