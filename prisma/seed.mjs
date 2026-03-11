import { PrismaClient } from "@prisma/client";
import { createHash } from "crypto";

// Simple bcrypt-compatible hash for seeding (use bcryptjs in production)
async function hashPassword(password) {
  const bcryptModule = await import("bcryptjs");
  const bcrypt = bcryptModule.default;
  return bcrypt.hash(password, 12);
}

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database...");

  // Create default admin user
  const adminHash = await hashPassword("Admin@123456");
  const admin = await prisma.user.upsert({
    where: { email: "admin@company.com" },
    create: {
      email: "admin@company.com",
      upn: "admin@company.com",
      name: "Portal Administrator",
      password: adminHash,
      role: "ADMIN",
      department: "IT",
      isActive: true,
    },
    // Always reset password + ensure account is active on re-seed
    update: {
      password: adminHash,
      upn: "admin@company.com",
      role: "ADMIN",
      isActive: true,
    },
  });
  console.log("✅ Admin user:", admin.email);

  // Create operator user
  const opHash = await hashPassword("Operator@123456");
  const operator = await prisma.user.upsert({
    where: { email: "operator@company.com" },
    create: {
      email: "operator@company.com",
      upn: "operator@company.com",
      name: "IAM Operator",
      password: opHash,
      role: "OPERATOR",
      department: "IT",
      isActive: true,
    },
    // Always reset password + ensure account is active on re-seed
    update: {
      password: opHash,
      upn: "operator@company.com",
      role: "OPERATOR",
      isActive: true,
    },
  });
  console.log("✅ Operator user:", operator.email);

  // Seed default settings
  const defaults = [
    { key: "appName", value: "AD Identity Management Portal", category: "general" },
    { key: "company", value: "Your Company", category: "general" },
    { key: "timezone", value: "UTC", category: "general" },
    { key: "sessionTimeout", value: "480", category: "general" },
    { key: "authProvider", value: "credentials", category: "auth" },
    { key: "upnDomain", value: "company.com", category: "auth" },
    { key: "ssoEnabled", value: "false", category: "auth" },
    { key: "requireMFA", value: "false", category: "auth" },
    { key: "azureClientId", value: "", category: "auth" },
    { key: "azureTenantId", value: "", category: "auth" },
    { key: "azureClientSecret", value: "", category: "auth" },
    { key: "azureRedirectUri", value: "http://localhost:3000/api/auth/callback/azure-ad", category: "auth" },
    { key: "psScriptsPath", value: "C:\\Scripts\\IAM", category: "powershell" },
    { key: "psExecutionPolicy", value: "RemoteSigned", category: "powershell" },
    { key: "psTimeoutMs", value: "300000", category: "powershell" },
    { key: "psVerboseLogging", value: "true", category: "powershell" },
    { key: "adDomain", value: "company.com", category: "ad" },
    { key: "adDcServer", value: "dc01.company.com", category: "ad" },
    { key: "adBaseOu", value: "DC=company,DC=com", category: "ad" },
    { key: "adOuUsers", value: "OU=Users,DC=company,DC=com", category: "ad" },
    { key: "adOuService", value: "OU=ServiceAccounts,DC=company,DC=com", category: "ad" },
    { key: "adOuRpa", value: "OU=RPA,DC=company,DC=com", category: "ad" },
    { key: "adOuShared", value: "OU=SharedAccounts,DC=company,DC=com", category: "ad" },
    // AD Service Account (Run-As identity for PowerShell AD operations)
    { key: "adRunAsMode", value: "process", category: "ad" },
    { key: "adServiceAccount", value: "", category: "ad" },
    { key: "adServiceAccountPassword", value: "", category: "ad" },
    { key: "adServiceAccountDomain", value: "", category: "ad" },
    { key: "emailEnabled", value: "false", category: "notifications" },
    { key: "smtpHost", value: "", category: "notifications" },
    { key: "smtpPort", value: "587", category: "notifications" },
    { key: "smtpUser", value: "", category: "notifications" },
    { key: "smtpFrom", value: "iam-portal@company.com", category: "notifications" },
    { key: "notifyOnFailure", value: "true", category: "notifications" },
    { key: "notifyOnSuccess", value: "false", category: "notifications" },
  ];

  for (const s of defaults) {
    await prisma.settings.upsert({
      where: { key: s.key },
      create: s,
      update: {},
    });
  }
  console.log(`✅ Seeded ${defaults.length} settings`);

  // Seed sample audit logs
  const taskTypes = [
    "ADD_USER_TO_GROUP", "BULK_ADD_USERS_TO_GROUP", "CREATE_SERVICE_ACCOUNTS",
    "CREATE_RPA_ACCOUNTS", "ONBOARD_WORKDAY", "ONBOARD_VNDLY",
  ];
  const statuses = ["SUCCESS", "SUCCESS", "SUCCESS", "FAILURE", "PARTIAL"];

  for (let i = 0; i < 30; i++) {
    const daysAgo = Math.floor(Math.random() * 7);
    const ts = new Date();
    ts.setDate(ts.getDate() - daysAgo);
    ts.setHours(Math.floor(Math.random() * 8) + 9);

    const taskType = taskTypes[Math.floor(Math.random() * taskTypes.length)];
    const status = statuses[Math.floor(Math.random() * statuses.length)];
    const isBulk = Math.random() > 0.5;
    const total = isBulk ? Math.floor(Math.random() * 50) + 5 : null;
    const success = total ? Math.floor(total * (status === "SUCCESS" ? 1 : status === "PARTIAL" ? 0.7 : 0)) : null;

    await prisma.auditLog.create({
      data: {
        timestamp: ts,
        userId: Math.random() > 0.5 ? admin.id : operator.id,
        userName: Math.random() > 0.5 ? admin.name : operator.name,
        userEmail: Math.random() > 0.5 ? admin.email : operator.email,
        action: `Execute ${taskType}`,
        taskType,
        status,
        duration: Math.floor(Math.random() * 10000) + 500,
        itemCount: total,
        successCount: success,
        failureCount: total && success !== null ? total - success : null,
        ipAddress: "192.168.1." + (Math.floor(Math.random() * 50) + 100),
        batchId: isBulk ? `BATCH-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}` : null,
        psScript: `script-${i}.ps1`,
      },
    });
  }
  console.log("✅ Seeded 30 sample audit logs");

  console.log("\n🎉 Database seeded successfully!");
  console.log("\n📋 Default credentials:");
  console.log("   Admin:    admin@company.com / Admin@123456");
  console.log("   Operator: operator@company.com / Operator@123456");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
