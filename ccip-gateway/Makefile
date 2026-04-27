.PHONY: dev build start test

dev:
	npx tsx watch src/index.ts

build:
	npx tsc

start: build
	node dist/index.js

test:
	npx vitest run
