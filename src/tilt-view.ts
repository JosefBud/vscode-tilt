import * as vscode from 'vscode';
import z from 'zod';
import type { ErrorEvent } from 'undici-types';
import {
  $initialEvent,
  $uiResourceMetadata,
  $span,
  $uiResourceStatus,
  $uiResource,
  $uiButton,
  $restartPayload,
  $updatePayload,
} from './types/tilt-websocket';
import { addMicrosecondOffsetToIsoDatetime } from './utils';

type Resource = z.infer<typeof $uiResource>;
type Button = z.infer<typeof $uiButton>;
type InitialEvent = z.infer<typeof $initialEvent>;

const ItemType = z.enum(['label', 'resourceEnabled', 'resourceDisabled']);
type ItemType = z.infer<typeof ItemType>;
const $itemContext = z.discriminatedUnion('type', [
  z.object({
    type: z.literal(ItemType.enum.label),
    name: z.string(),
  }),
  z.object({
    type: z.union([
      z.literal(ItemType.enum.resourceEnabled),
      z.literal(ItemType.enum.resourceDisabled),
    ]),
    name: z.string(),
    metadata: $uiResourceMetadata,
    status: $uiResourceStatus,
  }),
]);
type ItemContext = z.infer<typeof $itemContext>;

/**
 * `{ name: Resource }`
 */
type Resources = Map<string, Resource>;

/**
 * @example
 * {
 *  "someLabel": {
 *   "someResource": { ...resourceData },
 *   "anotherResource": { ...resourceData },
 *  },
 *  "anotherLabel": {
 *   "yetAnotherResource": { ...resourceData },
 *   "itsAnotherResource": { ...resourceData },
 *  }
 * }
 */
type LabeledResources = Map<string, Resources>;

/**
 * `{ name: Button }`
 */
type Buttons = Map<string, z.infer<typeof $uiButton>>;

const UNLABELED = 'unlabeled' as const;
const generateDefaultLabeledResources = () => new Map([[UNLABELED, new Map()]]);

export class TiltViewProvider implements vscode.TreeDataProvider<TiltViewItem> {
  // region Events
  private _onDidChangeTreeData: vscode.EventEmitter<
    TiltViewItem | undefined | void
  > = new vscode.EventEmitter();
  readonly onDidChangeTreeData: vscode.Event<TiltViewItem | undefined | void> =
    this._onDidChangeTreeData.event;
  // endregion

  // region Public
  /**
   * Set externally when the view visibility changes.
   * Primarily used to stop attempting to open server connections if the view isn't active.
   * This is only for new connections; existing connections will always stay open and
   * continuously updating state to stay ready.
   */
  public isViewVisible: boolean = true;
  // endregion

  // region Private
  private socket: WebSocket | undefined;
  private lastWebSocketError: ErrorEvent | undefined;
  private readonly hostname: string;
  private readonly port: string | number;
  private isInitialized = false;
  private manifests: string[] = [];
  private readonly resources: Resources = new Map();
  private labeledResources: LabeledResources =
    generateDefaultLabeledResources();
  private readonly buttons: Buttons = new Map();

  private get labels() {
    return [...this.labeledResources.keys()];
  }
  // endregion

  constructor(private readonly context: vscode.ExtensionContext) {
    console.log('Constructing TiltViewProvider');

    // Config value setup
    const config = vscode.workspace.getConfiguration('vscode-tilt');
    this.hostname = config.get('tiltServerHostname') ?? 'localhost';
    this.port = config.get('tiltServerPort') ?? '10350';

    // Command setup
    this.restartResourceCommand = this.restartResourceCommand.bind(this);
    this.toggleDisableStatusResourceCommand =
      this.toggleDisableStatusResourceCommand.bind(this);
    vscode.commands.registerCommand(
      'vscode-tilt.restartResource',
      this.restartResourceCommand,
    );
    vscode.commands.registerCommand(
      'vscode-tilt.disableResource',
      this.toggleDisableStatusResourceCommand,
    );
    vscode.commands.registerCommand(
      'vscode-tilt.enableResource',
      this.toggleDisableStatusResourceCommand,
    );

    // Interval to check on connection state and re-connect if necessary
    const interval = setInterval(() => {
      if (this.socket) {
        if (this.socket.readyState === WebSocket.OPEN) return;
        if (
          this.socket.readyState === WebSocket.CONNECTING &&
          this.lastWebSocketError
        ) {
          this.socket.close();
        }
      }
      if (!this.isViewVisible) return;
      this.reset();
      this.openConnection();
    }, 1000);
    this.context.subscriptions.push(
      new vscode.Disposable(() => clearInterval(interval)),
    );
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  reset(): void {
    try {
      this.socket?.close?.();
    } catch {}
    this.socket = undefined;
    this.isInitialized = false;
    this.manifests = [];
    this.buttons.clear();
    this.labeledResources = generateDefaultLabeledResources();
    this.resources.clear();
    this.lastWebSocketError = undefined;

    this.refresh();
  }

  getTreeItem(element: TiltViewItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: TiltViewItem): Thenable<TiltViewItem[]> {
    const DEFAULT = Promise.resolve([]);
    if (!element && !this.isInitialized) return DEFAULT;
    if (!element) return Promise.resolve(this.generateLabelParents());

    switch (element.contextValue) {
      case ItemType.enum.label: {
        const resources = this.labeledResources.get(element.itemContext.name);
        if (!resources) return DEFAULT;
        return Promise.resolve(
          [...resources.values()].map((resource) => {
            const itemContext: ItemContext = {
              type:
                resource.status.disableStatus?.state === 'Disabled'
                  ? ItemType.enum.resourceDisabled
                  : ItemType.enum.resourceEnabled,
              name: resource.metadata.name,
              metadata: resource.metadata,
              status: resource.status,
            };
            return new TiltViewItem(
              this.context.extensionUri,
              itemContext,
              vscode.TreeItemCollapsibleState.None,
              resource,
            );
          }),
        );
      }
      default:
        return DEFAULT;
    }
  }

  openConnection(): void {
    // The socket property should be undefined via this.reset() before creating a new one
    if (this.socket) return;
    this.socket = new WebSocket(`ws://${this.hostname}:${this.port}/ws/view`);
    this.socket.addEventListener('error', (error) => {
      this.lastWebSocketError = error;
    });
    this.socket.addEventListener('message', (event) => {
      const parsedData = JSON.parse(
        typeof event.data === 'string' ? event.data : '{}',
      );
      // 'isComplete' seems to only show up in the first websocket message, which is also
      // a full payload of all of the Tilt data, so it can be used to initialize everything.
      if ('isComplete' in parsedData) {
        const parsedEvent = $initialEvent.safeParse(parsedData);
        if (parsedEvent.success) {
          this.initialize(parsedEvent.data);
        } else {
          console.error('Unable to parse initial event', parsedEvent.error);
        }
      } else if ('uiResources' in parsedData) {
        const uiResources = z
          .array($uiResource)
          .safeParse(parsedData.uiResources);
        if (uiResources.success) {
          this.updateResources(uiResources.data);
        } else {
          console.error('Error while parsing uiResources:', uiResources.error);
        }
      }
      if ('uiButtons' in parsedData) {
        const uiButtons = z.array($uiButton).safeParse(parsedData.uiButtons);
        if (uiButtons.success) {
          this.updateButtons(uiButtons.data);
        } else {
          console.error('Error while parsing uiButtons:', uiButtons.error);
        }
      }
      this.refresh();
    });
  }

  async restartResourceCommand(resourceView: TiltViewItem): Promise<void> {
    if (!resourceView.resource) {
      console.error(
        "Resource tree item doesn't have a public 'resource' property for some reason. Resource tree item is:",
        resourceView,
      );
      return;
    }
    const name = resourceView.resource.metadata.name;
    try {
      const res = await fetch(
        `http://${this.hostname}:${this.port}/api/trigger`,
        {
          method: 'POST',
          body: JSON.stringify({
            manifest_names: [name],
            build_reason: 16,
          } satisfies z.infer<typeof $restartPayload>),
        },
      );
      if (!res.ok) {
        let body;
        try {
          body = await res.json();
        } catch {}
        console.error(
          'Tilt server responded with a non-OK status',
          res.status,
          body,
        );
      }
      console.log('Successfully restarted', name);
    } catch (error) {
      console.error(
        'Error thrown while sending a request to the /api/trigger endpoint',
        error,
      );
    }
  }

  async toggleDisableStatusResourceCommand(
    resourceView: TiltViewItem,
  ): Promise<void> {
    // Need to start storing and managing `uiButtons` in websocket messages
    // uiButtons[n].metadata.resourceVersion seems to be an important thing
    if (!resourceView.resource) {
      console.error(
        "Resource tree item doesn't have a public 'resource' property for some reason. Resource tree item is:",
        resourceView,
      );
      return;
    }
    const name = resourceView.resource.metadata.name;
    const buttonName = `toggle-${name}-disable`;
    const currentVersion =
      this.buttons.get(buttonName)?.metadata.resourceVersion;
    const currentState = this.resources.get(name)?.status.disableStatus?.state;
    if (!currentVersion) {
      console.error(`Button ${buttonName} not found in Button map`, [
        ...this.buttons.entries(),
      ]);
      return;
    }
    try {
      const res = await fetch(
        `http://${this.hostname}:${this.port}/proxy/apis/tilt.dev/v1alpha1/uibuttons/${buttonName}/status`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            metadata: {
              resourceVersion: currentVersion,
              name: buttonName,
            },
            status: {
              lastClickedAt: addMicrosecondOffsetToIsoDatetime(new Date()),
              inputs: [
                {
                  name: 'action',
                  hidden: {
                    value:
                      currentState === 'Enabled'
                        ? 'on' // Disable the resource
                        : 'off', // Enable the resource
                  },
                },
              ],
            },
          } satisfies z.infer<typeof $updatePayload>),
        },
      );
      if (!res.ok) {
        let body;
        try {
          body = await res.json();
        } catch {}
        console.error(
          'Tilt server responded with a non-OK status',
          res.status,
          body,
        );
      }
      console.log(
        'Successfully toggled',
        name,
        'to be turned',
        currentState === 'Enabled' ? 'off' : 'on',
      );
    } catch (error) {
      console.error(
        'Error thrown while sending a request to the PUT button status endpoint',
        error,
      );
    }
  }

  // region FOLLOWUP
  // When Tilt starts, the initial message is missing a lot of spans/manifests. Need to
  // test this and adjust.
  private initialize(initialEvent: InitialEvent): void {
    this.manifests = Object.values(initialEvent.logList.spans).reduce<string[]>(
      (acc, curr) => {
        const parsed = $span.safeParse(curr).data;
        if (parsed && parsed.manifestName) {
          return [...acc, parsed.manifestName];
        }
        return acc;
      },
      [] as string[],
    );
    if (initialEvent.uiResources) {
      this.updateResources(initialEvent.uiResources);
    }
    this.updateButtons([...initialEvent.uiButtons]);
    this.isInitialized = true;
  }
  // endregion

  /**
   * Takes in an array of Resources and updates both `this.resources` and `this.labeledResources`
   */
  private updateResources(resources: readonly Resource[]) {
    for (const resource of resources) {
      this.resources.set(resource.metadata.name, { ...resource });
      if (!resource.metadata.labels) {
        const unlabeled = this.labeledResources.get(UNLABELED)!;
        unlabeled.set(resource.metadata.name, resource);
        continue;
      }
      for (const label of Object.keys(resource.metadata.labels)) {
        let labeled = this.labeledResources.get(label);
        if (!labeled) {
          labeled = new Map();
          this.labeledResources.set(label, labeled);
        }
        labeled.set(resource.metadata.name, { ...resource });
      }
    }
  }

  private updateButtons(buttons: readonly Button[]) {
    for (const button of buttons) {
      this.buttons.set(button.metadata.name, button);
    }
  }

  private generateLabelParents(): TiltViewItem[] {
    try {
      return this.labels.map((name) => {
        const itemContext: ItemContext = { type: ItemType.enum.label, name };
        return new TiltViewItem(
          this.context.extensionUri,
          itemContext,
          vscode.TreeItemCollapsibleState.Expanded,
        );
      });
    } catch (error) {
      console.error(error);
      // vscode.env.clipboard.writeText(this.dataString || '');
      return [];
    }
  }
}

export class TiltViewItem extends vscode.TreeItem {
  constructor(
    public extensionRoot: vscode.Uri,
    public itemContext: ItemContext,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly resource?: Resource,
    public readonly command?: vscode.Command,
  ) {
    super(itemContext.name ?? '(No name)', collapsibleState);
    this.contextValue = itemContext.type;
    // this.tooltip = '';
    // this.description = '';
    if (itemContext.type === ItemType.enum.resourceEnabled) {
      switch (itemContext.status.runtimeStatus) {
        case 'ok': {
          this.iconPath = new vscode.ThemeIcon('testing-passed-icon');
          break;
        }
        case 'error': {
          this.iconPath = new vscode.ThemeIcon(
            'warning',
            new vscode.ThemeColor('errorForeground'),
          );
          break;
        }
        case 'pending': {
          this.iconPath = new vscode.ThemeIcon('testing-queued-icon');
          break;
        }
        default: {
          break;
        }
      }
    } else if (itemContext.type === ItemType.enum.resourceDisabled) {
      this.iconPath = new vscode.ThemeIcon('close');
    }
  }
}
