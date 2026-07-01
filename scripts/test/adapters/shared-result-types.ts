import { RunResultJson, TestLayer, TestStatus } from '../../../tests/manifest/test-types';

export { RunResultJson, TestLayer, TestStatus };

export interface AdapterResult {
  status: 'ok' | 'error';
  result?: Partial<RunResultJson>;
  error?: string;
}
