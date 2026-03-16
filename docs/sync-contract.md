# Sync Contract v1

Muc tieu:

- Ho tro PWA offline-first.
- FE la nguon tao thay doi local.
- Backend Go la nguon su that cuoi cung.
- Conflict strategy cho MVP: `last write wins` theo `lastModifiedAt`.
- Huong dai han: `push/pull` la data layer, `websocket` la signal layer cho realtime.

## Kien truc dong bo

1. FE ghi CRUD vao local DB truoc.
2. FE gom local mutations de `push` len backend.
3. Backend ap dung mutation, luu canonical state, generate `studentCode` neu can.
4. Backend phat su kien realtime qua `websocket`.
5. Client khac nhan su kien `sync.changed` va goi `pull(since=...)`.
6. `pull` moi la nguon du lieu chuan de merge vao local DB.

Nguyen tac:

- Khong broadcast full record qua websocket trong v1.
- Websocket chi dung de thong bao "co thay doi".
- Du lieu chuan luon di qua `pull`.
- Neu websocket mat ket noi, FE van co the fallback bang `pull` theo chu ky.

## Endpoints

### `POST /api/v1/sync/push`

Day local mutations len backend.

Request:

```json
{
	"deviceId": "device-001",
	"mutations": [
		{
			"mutationId": "0f6ec2e6-2fd7-4f9d-bc04-0f8f3b32a3ad",
			"entityName": "students",
			"operation": "upsert",
			"recordId": "4f9c8e17-8cb5-4f0e-b7d4-4df4de85f5a4",
			"clientModifiedAt": "2026-02-28T08:20:00.000Z",
			"record": {
				"id": "4f9c8e17-8cb5-4f0e-b7d4-4df4de85f5a4",
				"studentCode": null,
				"fullName": "Nguyen Van A",
				"clubId": "vo-duong-trung-tam-a1b2",
				"beltRankId": "dai-trang-1",
				"status": "active",
				"createdAt": "2026-02-28T08:20:00.000Z",
				"updatedAt": "2026-02-28T08:20:00.000Z",
				"lastModifiedAt": "2026-02-28T08:20:00.000Z",
				"syncStatus": "pending"
			}
		}
	]
}
```

Response:

```json
{
	"serverTime": "2026-02-28T08:21:00.000Z",
	"applied": [
		{
			"entityName": "students",
			"serverModifiedAt": "2026-02-28T08:21:00.000Z",
			"record": {
				"id": "4f9c8e17-8cb5-4f0e-b7d4-4df4de85f5a4",
				"studentCode": "PQQ-000001",
				"fullName": "Nguyen Van A",
				"clubId": "vo-duong-trung-tam-a1b2",
				"beltRankId": "dai-trang-1",
				"status": "active",
				"createdAt": "2026-02-28T08:20:00.000Z",
				"updatedAt": "2026-02-28T08:21:00.000Z",
				"lastModifiedAt": "2026-02-28T08:21:00.000Z",
				"syncStatus": "synced"
			}
		}
	],
	"conflicts": []
}
```

## Conflict response

```json
{
	"serverTime": "2026-02-28T08:21:00.000Z",
	"applied": [],
	"conflicts": [
		{
			"mutationId": "0f6ec2e6-2fd7-4f9d-bc04-0f8f3b32a3ad",
			"entityName": "belt_ranks",
			"recordId": "dai-vang-2",
			"reason": "duplicate_value",
			"message": "Belt rank order already exists.",
			"serverRecord": {
				"id": "dai-vang-2",
				"name": "Dai vang",
				"order": 2,
				"isActive": true,
				"createdAt": "2026-02-27T10:00:00.000Z",
				"updatedAt": "2026-02-28T07:00:00.000Z",
				"lastModifiedAt": "2026-02-28T07:00:00.000Z",
				"syncStatus": "synced"
			}
		}
	]
}
```

### `GET /api/v1/sync/pull?deviceId={deviceId}&since={timestamp}&limit={number}`

Lay thay doi tu backend theo watermark `since`.

Response:

```json
{
	"serverTime": "2026-02-28T08:30:00.000Z",
	"nextSince": "2026-02-28T08:30:00.000Z",
	"hasMore": false,
	"changes": [
		{
			"entityName": "clubs",
			"serverModifiedAt": "2026-02-28T08:25:00.000Z",
			"record": {
				"id": "vo-duong-trung-tam-a1b2",
				"name": "Vo duong Trung Tam",
				"isActive": true,
				"createdAt": "2026-02-28T08:00:00.000Z",
				"updatedAt": "2026-02-28T08:25:00.000Z",
				"lastModifiedAt": "2026-02-28T08:25:00.000Z",
				"syncStatus": "synced"
			}
		}
	]
}
```

### `GET /api/v1/sync/ws`

WebSocket endpoint de nhan realtime notification.

Muc dich:

- Bao cho cac client online biet da co thay doi tren server.
- Khong dung thay the cho `pull`.

Client flow:

1. Mo websocket sau khi dang nhap hoac khi app online.
2. Khi nhan `sync.changed`, debounce ngan.
3. Goi `pull(since=lastSyncAt)`.
4. Merge canonical records vao local DB.

### WebSocket messages

Connected:

```json
{
	"type": "connected",
	"connectionId": "ws_01JMM3Q4M6HE7RYW4D9R2G5JQ0",
	"serverTime": "2026-02-28T08:30:00.000Z"
}
```

Changed:

```json
{
	"type": "sync.changed",
	"serverTime": "2026-02-28T08:31:00.000Z",
	"entityNames": ["students"],
	"recordIds": ["4f9c8e17-8cb5-4f0e-b7d4-4df4de85f5a4"]
}
```

Ping:

```json
{
	"type": "ping",
	"serverTime": "2026-02-28T08:31:30.000Z"
}
```

Luu y:

- `recordIds` chi de hint, FE khong merge truc tiep tu message nay.
- Neu co nhieu thay doi lien tiep, backend co the gop thanh 1 event `sync.changed`.
- FE nen debounce 300-500ms truoc khi goi `pull`.

## Rules

- Tat ca bang deu dung `deletedAt` cho soft delete.
- `syncStatus` la trang thai local, backend co the tra ve `synced`.
- Backend se generate `studentCode` neu record `students` chua co code.
- Format `studentCode`: `PQQ-000001`.
- `clubs.id`: `unaccent(name) + '-' + 4 ky tu random`.
- `belt_ranks.id`: `unaccent(name) + '-' + order`.
- `students.id`: UUID tao tu FE.

## Last write wins

- So sanh bang `lastModifiedAt`.
- Neu `clientModifiedAt` cu hon ban ghi tren server, server co the tra ve `conflicts`.
- FE uu tien luu `serverRecord` khi co conflict de tranh local drift.

## Realtime strategy

- WebSocket la huong dai han cho realtime.
- `push/pull` van bat buoc ton tai, khong duoc thay bang websocket.
- Khi client A `push` thanh cong:
  - backend commit DB
  - backend publish `sync.changed`
  - client B nhan event va `pull`
- Khi client B dang offline:
  - bo lo event la chap nhan duoc
  - luc online lai se `pull` theo `since`

## Mapping bang backend Go

- `clubs`
- `belt_ranks`
- `students`

## Ghi chu implement backend

- `push` nen xu ly trong transaction theo tung mutation hoac batch nho.
- `pull` nen sort theo `last_modified_at asc`.
- `nextSince` nen dung thoi diem server commit cuoi cung trong batch.
- `limit` phuc vu incremental sync khi du lieu lon.
- WebSocket nen broadcast event sau khi transaction `push` commit thanh cong.
- Backend nen co heartbeat/ping dinh ky de FE phat hien stale connection.
