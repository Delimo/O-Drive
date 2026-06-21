import { createFileBatchActions } from './file-batch-actions.js';
import { createFileSearchActions } from './file-search-actions.js';
import { createFileShareActions } from './file-share-actions.js';
import { createFileViewUploadActions } from './file-view-upload-actions.js';
import { createTrashActions } from './trash-actions.js';

export const FileOpsActions = {};

Object.assign(FileOpsActions, createFileBatchActions());
Object.assign(FileOpsActions, createFileSearchActions());
Object.assign(FileOpsActions, createFileShareActions());
Object.assign(FileOpsActions, createFileViewUploadActions());
Object.assign(FileOpsActions, createTrashActions());
