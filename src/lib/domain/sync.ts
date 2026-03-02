import type { BeltRank, Club, Student } from '$lib/domain/models';

export type SyncEntityName = 'clubs' | 'belt_ranks' | 'students';
export type SyncOperation = 'upsert' | 'delete';

export interface SyncEntityMap {
	clubs: Club;
	belt_ranks: BeltRank;
	students: Student;
}

export type SyncEntityRecord = SyncEntityMap[keyof SyncEntityMap];

export interface SyncMutation<TEntityName extends SyncEntityName = SyncEntityName> {
	mutationId: string;
	entityName: TEntityName;
	operation: SyncOperation;
	recordId: SyncEntityMap[TEntityName]['id'];
	record: SyncEntityMap[TEntityName];
	clientModifiedAt: string;
}

export interface SyncPushRequest {
	deviceId: string;
	mutations: SyncMutation[];
}

export interface SyncAppliedRecord<TEntityName extends SyncEntityName = SyncEntityName> {
	entityName: TEntityName;
	record: SyncEntityMap[TEntityName];
	serverModifiedAt: string;
}

export interface SyncConflict<TEntityName extends SyncEntityName = SyncEntityName> {
	mutationId: string;
	entityName: TEntityName;
	recordId: SyncEntityMap[TEntityName]['id'];
	reason: 'stale_write' | 'duplicate_value' | 'foreign_key_missing' | 'validation_failed';
	message: string;
	serverRecord?: SyncEntityMap[TEntityName];
}

export interface SyncPushResponse {
	serverTime: string;
	applied: SyncAppliedRecord[];
	conflicts: SyncConflict[];
}

export interface SyncPullRequest {
	deviceId: string;
	since?: string;
	limit?: number;
}

export interface SyncPullChange<TEntityName extends SyncEntityName = SyncEntityName> {
	entityName: TEntityName;
	record: SyncEntityMap[TEntityName];
	serverModifiedAt: string;
}

export interface SyncPullResponse {
	serverTime: string;
	nextSince: string;
	hasMore: boolean;
	changes: SyncPullChange[];
}

export interface SyncRebaseResponse {
	serverTime: string;
	clubs: Club[];
	beltRanks: BeltRank[];
	students: Student[];
}

export type SyncRealtimeEventType = 'connected' | 'sync.changed' | 'ping';

export interface SyncRealtimeConnectedEvent {
	type: 'connected';
	connectionId: string;
	serverTime: string;
}

export interface SyncRealtimeChangedEvent {
	type: 'sync.changed';
	serverTime: string;
	entityNames: SyncEntityName[];
	recordIds: string[];
}

export interface SyncRealtimePingEvent {
	type: 'ping';
	serverTime: string;
}

export type SyncRealtimeEvent =
	| SyncRealtimeConnectedEvent
	| SyncRealtimeChangedEvent
	| SyncRealtimePingEvent;
