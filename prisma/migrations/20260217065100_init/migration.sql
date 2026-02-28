-- CreateTable
CREATE TABLE "SystemConfig" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "controlMode" TEXT NOT NULL,
    "assets" TEXT NOT NULL,
    "llmProvider" TEXT NOT NULL,
    "llmApiKey" TEXT NOT NULL,
    "mcpConfig" TEXT NOT NULL,
    "discordUrl" TEXT,
    "telegramTk" TEXT
);

-- CreateTable
CREATE TABLE "Widget" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "x" INTEGER NOT NULL,
    "y" INTEGER NOT NULL,
    "w" INTEGER NOT NULL,
    "h" INTEGER NOT NULL,
    "toolName" TEXT NOT NULL,
    "toolArgs" TEXT NOT NULL,
    "refreshInt" INTEGER NOT NULL DEFAULT 60
);

-- CreateTable
CREATE TABLE "BatchJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "cron" TEXT NOT NULL,
    "toolName" TEXT NOT NULL,
    "toolArgs" TEXT NOT NULL,
    "alertType" TEXT NOT NULL,
    "alertValue" INTEGER NOT NULL DEFAULT 0,
    "channels" TEXT NOT NULL,
    "lastRun" DATETIME,
    "lastStatus" TEXT,
    "lastResult" TEXT
);

-- CreateTable
CREATE TABLE "Incident" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "severity" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "details" TEXT
);
