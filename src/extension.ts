import * as vscode from 'vscode';
import { TiltViewProvider } from './tilt-view';

export function activate(context: vscode.ExtensionContext) {
  console.log('vscode-tilt activated');

  const outputChannel = vscode.window.createOutputChannel(
    'Tilt Resource Manager',
    'plaintext',
  );
  const tiltViewProvider = new TiltViewProvider(context, outputChannel);
  const view = vscode.window.createTreeView('tiltViewServices', {
    treeDataProvider: tiltViewProvider,
  });
  view.onDidChangeVisibility((e) => {
    tiltViewProvider.isViewVisible = e.visible;
  });
}

export function deactivate() {}
