import { PartialType } from '@nestjs/mapped-types';
import { CreateCoreSyncQueueDto } from './create-core-sync-queue.dto';

export class UpdateCoreSyncQueueDto extends PartialType(
  CreateCoreSyncQueueDto,
) {}
