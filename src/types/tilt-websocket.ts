import z from 'zod';

const metadata = {
  name: '(Tiltfile)',
  uid: 'f5929fe7-499d-4704-9083-19b86996540d',
  resourceVersion: '662',
  creationTimestamp: '2025-08-09T04:48:57Z',
  annotations: { 'tilt.dev/resource': '(Tiltfile)' },
  ownerReferences: [
    {
      apiVersion: 'tilt.dev/v1alpha1',
      kind: 'Tiltfile',
      name: '(Tiltfile)',
      uid: 'efb72819-350d-42c4-b5c7-bc58a7266e11',
      controller: true,
      blockOwnerDeletion: true,
    },
  ],
  managedFields: [
    {
      manager: 'tilt',
      operation: 'Update',
      apiVersion: 'tilt.dev/v1alpha1',
      time: '2025-08-09T04:48:57Z',
      fieldsType: 'FieldsV1',
      fieldsV1: {
        Raw: 'eyJmOm1ldGFkYXRhIjp7ImY6YW5ub3RhdGlvbnMiOnsiLiI6e30sImY6dGlsdC5kZXYvcmVzb3VyY2UiOnt9fSwiZjpvd25lclJlZmVyZW5jZXMiOnsiLiI6e30sIms6e1widWlkXCI6XCJlZmI3MjgxOS0zNTBkLTQyYzQtYjVjNy1iYzU4YTcyNjZlMTFcIn0iOnt9fX19',
      },
    },
  ],
};

const otherStatus = {
  lastDeployTime: '2025-08-09T04:49:38.176282Z',
  buildHistory: [
    {
      startTime: '2025-08-09T04:49:38.176230Z',
      finishTime: '2025-08-09T04:49:38.176282Z',
      spanID: 'build:11',
    },
  ],
  localResourceInfo: { pid: '89741' },
  runtimeStatus: 'ok',
  updateStatus: 'not_applicable',
  specs: [{ id: 'local:api-services-invitations', type: 'local' }],
  order: 7,
  disableStatus: {
    enabledCount: 1,
    state: 'Enabled',
    sources: [
      {
        configMap: {
          name: 'api-services-invitations-disable',
          key: 'isDisabled',
        },
      },
    ],
  },
  conditions: [
    {
      type: 'UpToDate',
      status: 'True',
      lastTransitionTime: '2025-08-09T04:49:38.203859Z',
    },
    {
      type: 'Ready',
      status: 'True',
      lastTransitionTime: '2025-08-09T04:49:38.203859Z',
    },
  ],
};

const status = {
  triggerMode: 2,
  pendingBuildSince: '2025-08-13T01:37:15.533513Z',
  hasPendingChanges: true,
  localResourceInfo: {},
  runtimeStatus: 'not_applicable',
  updateStatus: 'none',
  specs: [{ id: 'local:api-services-invitations-test', type: 'local' }],
  order: 8,
  disableStatus: {
    enabledCount: 1,
    state: 'Enabled',
    sources: [
      {
        configMap: {
          name: 'api-services-invitations-test-disable',
          key: 'isDisabled',
        },
      },
    ],
  },
  conditions: [
    {
      type: 'UpToDate',
      status: 'False',
      lastTransitionTime: '2025-08-09T04:49:00.040686Z',
      reason: 'Unknown',
    },
    {
      type: 'Ready',
      status: 'False',
      lastTransitionTime: '2025-08-09T04:49:00.040686Z',
      reason: 'Unknown',
    },
  ],
};

export const TriggerMode = z.enum({
  TriggerModeAuto: 0,
  TriggerModeManualWithAutoInit: 1,
  TriggerModeManual: 2,
  TriggerModeAutoWithManualInit: 3,
});

export const RuntimeStatus = z.enum([
  'ok',
  'pending',
  'error',
  'not_applicable',
  'unknown',
  'none',
]);

export const UpdateStatus = z.enum([...RuntimeStatus.options, 'in_progress']);

export const TargetType = z.enum([
  'unspecified',
  'image',
  'k8s',
  'docker-compose',
  'local',
]);

export const $buildHistory = z.object();

const $conditionBase = z.object({
  status: z.preprocess((val) => {
    if (val === 'True') return true;
    if (val === 'False') return false;
    return val;
  }, z.boolean()),
  lastTransitionTime: z.coerce.date(),
});

export const $uiResourceStatus = z.object({
  buildHistory: z.optional(z.array($buildHistory)),
  lastDeployTime: z.optional(z.coerce.date()),
  triggerMode: z.optional(TriggerMode),
  pendingBuildSince: z.optional(z.coerce.date()),
  hasPendingChanges: z.optional(z.boolean()),
  localResourceInfo: z.optional(
    z.object({
      pid: z.optional(z.string()),
    }),
  ),
  runtimeStatus: RuntimeStatus,
  updateStatus: UpdateStatus,
  specs: z.optional(
    z.array(
      z.object({
        id: z.string(),
        type: TargetType,
      }),
    ),
  ),
  order: z.number(),
  disableStatus: z.optional(
    z.intersection(
      z.object({
        state: z.enum(['Enabled', 'Disabled']),
        sources: z.array(
          z.object({
            configMap: z.object({
              name: z.string(),
              key: z.string(),
            }),
          }),
        ),
      }),
      z.union([
        z.object({
          disabledCount: z.number(),
          enabledCount: z.undefined(),
        }),
        z.object({
          disabledCount: z.undefined(),
          enabledCount: z.number(),
        }),
      ]),
    ),
  ),
  conditions: z.array(
    z.discriminatedUnion('type', [
      $conditionBase.extend({
        type: z.literal('UpToDate'),
        reason: z.optional(
          z.union([
            z.literal('Disabled'),
            z.literal('UpdateError'),
            z.literal('UpdatePending'),
            z.literal('Unknown'),
          ]),
        ),
      }),
      $conditionBase.extend({
        type: z.literal('Ready'),
        reason: z.optional(
          z.union([
            z.literal('Disabled'),
            z.literal('RuntimeError'),
            z.literal('UpdateError'),
            z.literal('RuntimePending'),
            z.literal('UpdatePending'),
            z.literal('Unknown'),
          ]),
        ),
      }),
    ]),
  ),
});

export const $uiResourceMetadata = z.object({
  name: z.string(),
  uid: z.string(),
  resourceVersion: z.string(),
  creationTimestamp: z.coerce.date(),
  labels: z.optional(z.record(z.string(), z.string())),
  // annotations: z.record(z.string(), z.string()),
  // ownerReferences: z.array($ownerReference)
  // managedFields: z.array()
});

export const $uiResource = z.object({
  metadata: $uiResourceMetadata,
  status: $uiResourceStatus,
});

export const $uiButtonMetadata = z.object({
  name: z.string(),
  resourceVersion: z.string().regex(/^[0-9]*$/),
});

export const $uiButtonSpecInput = z.object({
  name: z.literal('action'),
  hidden: z.object({
    value: z.union([z.literal('on'), z.literal('off')]),
  }),
});

export const $uiButtonSpec = z
  .object({
    location: z.object({
      componentID: z.string(),
      componentType: z.union([z.literal('Resource'), z.literal('Global')]),
    }),
    text: z.string(),
  })
  .and(
    z.union([
      z.object({
        iconName: z.optional(
          z.union([z.literal('cancel'), z.literal('download')]),
        ),
      }),
      z.object({
        requiresConfirmation: z.optional(z.boolean()),
        inputs: z.optional(z.array($uiButtonSpecInput)),
      }),
    ]),
  );

export const $uiButton = z.object({
  metadata: $uiButtonMetadata,
  spec: $uiButtonSpec,
});

export const $logLevel = z.enum({ Info: 'INFO', Warn: 'WARN', Error: 'ERROR' });
export const $span = z.object({
  manifestName: z.optional(z.string()),
});
export const $spans = z.record(z.string(), $span);
export const $logSegment = z.object({
  spanId: z.optional(z.string()),
  level: $logLevel,
  text: z.string(),
  time: z.iso.datetime(),
  /**
   * Not confident on the schema for this property, so it's commented out until I want to
   * use it for something.
   */
  // fields: z.optional(
  //   z.object({
  //     buildEvent: z.literal('init'),
  //   }),
  // ),
});
export const $logList = z.object({
  segments: z.array($logSegment),
  spans: $spans,
});

export const $initialEvent = z.object({
  isComplete: z.boolean(),
  logList: $logList,
  uiResources: z.optional(z.array($uiResource)),
  uiButtons: z.array($uiButton),
});

/**
 * The payload shape used when sending a PUT request to the Tilt API in order to take an
 * action on a resource, such as disabling or running a custom action
 */
export const $updatePayload = z.object({
  metadata: $uiButtonMetadata,
  status: z.object({
    lastClickedAt: z.iso.datetime({ offset: true }),
    inputs: z.array($uiButtonSpecInput),
  }),
});

const BUILD_REASON_FLAG_TRIGGER_WEB = 16;
/**
 * The payload shape used when sending a POST request to the Tilt API in order to restart,
 * or "trigger", a resource
 */
export const $restartPayload = z.object({
  manifest_names: z.tuple([z.string()]), // Only supports an array w/ 1 element
  build_reason: z.literal(BUILD_REASON_FLAG_TRIGGER_WEB), // "BuildReasonFlagTriggerWeb" https://github.com/tilt-dev/tilt/blob/04fd1f2c6c5137ba38a2db9b1c8fece21a5162db/pkg/model/build_reason.go#L9-L41
});
