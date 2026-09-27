-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'user',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "factories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "taxId" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "addressLine" TEXT,
    "city" TEXT,
    "postalCode" TEXT,
    "province" TEXT,
    "defaultCommissionPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "paymentTermDays" INTEGER NOT NULL DEFAULT 30,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "factories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "articles" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'ud',
    "ean" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "articles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "factory_articles" (
    "id" TEXT NOT NULL,
    "factoryId" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "factorySku" TEXT,
    "commissionPctOverride" DECIMAL(5,2),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "factory_articles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_lists" (
    "id" TEXT NOT NULL,
    "factoryId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "effectiveFrom" DATE NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "activatedAt" TIMESTAMP(3),

    CONSTRAINT "price_lists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_list_lines" (
    "id" TEXT NOT NULL,
    "priceListId" TEXT NOT NULL,
    "factoryArticleId" TEXT NOT NULL,
    "unitPrice" DECIMAL(12,4) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "validFrom" DATE NOT NULL,
    "validTo" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "price_list_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "taxId" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "addressLine" TEXT,
    "city" TEXT,
    "postalCode" TEXT,
    "province" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_orders" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "orderDate" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_order_lines" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "qty" DECIMAL(12,3) NOT NULL,
    "unitPrice" DECIMAL(12,4) NOT NULL,
    "lineTotal" DECIMAL(14,4) NOT NULL,
    "factoryId" TEXT,
    "priceListLineId" TEXT,
    "priceListCode" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_order_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_orders" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "factoryId" TEXT NOT NULL,
    "salesOrderId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "sentAt" TIMESTAMP(3),
    "shippedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_order_lines" (
    "id" TEXT NOT NULL,
    "serviceOrderId" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "salesOrderLineId" TEXT,
    "qty" DECIMAL(12,3) NOT NULL,
    "unitPrice" DECIMAL(12,4) NOT NULL,
    "lineTotal" DECIMAL(14,4) NOT NULL,
    "commissionPct" DECIMAL(5,2) NOT NULL,
    "commissionAmount" DECIMAL(14,4) NOT NULL,

    CONSTRAINT "service_order_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_batches" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "verifiedById" TEXT,

    CONSTRAINT "verification_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receipt_verifications" (
    "id" TEXT NOT NULL,
    "serviceOrderId" TEXT NOT NULL,
    "receivedAt" DATE NOT NULL,
    "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "result" TEXT NOT NULL,
    "notes" TEXT,
    "verifiedById" TEXT,
    "batchId" TEXT,

    CONSTRAINT "receipt_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commission_invoices" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "factoryId" TEXT NOT NULL,
    "issueDate" DATE NOT NULL,
    "dueDate" DATE,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "taxPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "subtotal" DECIMAL(14,4) NOT NULL,
    "taxTotal" DECIMAL(14,4) NOT NULL,
    "total" DECIMAL(14,4) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commission_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commission_invoice_lines" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "base" DECIMAL(14,4) NOT NULL,
    "commissionPct" DECIMAL(5,2) NOT NULL,
    "amount" DECIMAL(14,4) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "commission_invoice_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commission_invoice_service_orders" (
    "invoiceId" TEXT NOT NULL,
    "serviceOrderId" TEXT NOT NULL,
    "commissionAmount" DECIMAL(14,4) NOT NULL,

    CONSTRAINT "commission_invoice_service_orders_pkey" PRIMARY KEY ("invoiceId","serviceOrderId")
);

-- CreateTable
CREATE TABLE "document_sequences" (
    "kind" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "document_sequences_pkey" PRIMARY KEY ("kind","year")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "factories_taxId_key" ON "factories"("taxId");

-- CreateIndex
CREATE UNIQUE INDEX "articles_sku_key" ON "articles"("sku");

-- CreateIndex
CREATE INDEX "factory_articles_articleId_active_idx" ON "factory_articles"("articleId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "factory_articles_factoryId_articleId_key" ON "factory_articles"("factoryId", "articleId");

-- CreateIndex
CREATE INDEX "price_lists_factoryId_status_idx" ON "price_lists"("factoryId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "price_lists_factoryId_code_key" ON "price_lists"("factoryId", "code");

-- CreateIndex
CREATE INDEX "price_list_lines_factoryArticleId_validFrom_idx" ON "price_list_lines"("factoryArticleId", "validFrom");

-- CreateIndex
CREATE INDEX "price_list_lines_priceListId_idx" ON "price_list_lines"("priceListId");

-- CreateIndex
CREATE UNIQUE INDEX "customers_taxId_key" ON "customers"("taxId");

-- CreateIndex
CREATE UNIQUE INDEX "sales_orders_reference_key" ON "sales_orders"("reference");

-- CreateIndex
CREATE INDEX "sales_orders_status_orderDate_idx" ON "sales_orders"("status", "orderDate");

-- CreateIndex
CREATE INDEX "sales_orders_customerId_idx" ON "sales_orders"("customerId");

-- CreateIndex
CREATE INDEX "sales_order_lines_orderId_idx" ON "sales_order_lines"("orderId");

-- CreateIndex
CREATE INDEX "sales_order_lines_factoryId_idx" ON "sales_order_lines"("factoryId");

-- CreateIndex
CREATE UNIQUE INDEX "service_orders_number_key" ON "service_orders"("number");

-- CreateIndex
CREATE INDEX "service_orders_status_idx" ON "service_orders"("status");

-- CreateIndex
CREATE INDEX "service_orders_factoryId_status_idx" ON "service_orders"("factoryId", "status");

-- CreateIndex
CREATE INDEX "service_order_lines_serviceOrderId_idx" ON "service_order_lines"("serviceOrderId");

-- CreateIndex
CREATE INDEX "service_order_lines_salesOrderLineId_idx" ON "service_order_lines"("salesOrderLineId");

-- CreateIndex
CREATE UNIQUE INDEX "verification_batches_reference_key" ON "verification_batches"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "receipt_verifications_serviceOrderId_key" ON "receipt_verifications"("serviceOrderId");

-- CreateIndex
CREATE INDEX "receipt_verifications_result_idx" ON "receipt_verifications"("result");

-- CreateIndex
CREATE INDEX "receipt_verifications_batchId_idx" ON "receipt_verifications"("batchId");

-- CreateIndex
CREATE UNIQUE INDEX "commission_invoices_number_key" ON "commission_invoices"("number");

-- CreateIndex
CREATE INDEX "commission_invoices_status_issueDate_idx" ON "commission_invoices"("status", "issueDate");

-- CreateIndex
CREATE INDEX "commission_invoices_factoryId_status_idx" ON "commission_invoices"("factoryId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "commission_invoice_service_orders_serviceOrderId_key" ON "commission_invoice_service_orders"("serviceOrderId");

-- AddForeignKey
ALTER TABLE "factory_articles" ADD CONSTRAINT "factory_articles_factoryId_fkey" FOREIGN KEY ("factoryId") REFERENCES "factories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "factory_articles" ADD CONSTRAINT "factory_articles_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_lists" ADD CONSTRAINT "price_lists_factoryId_fkey" FOREIGN KEY ("factoryId") REFERENCES "factories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_list_lines" ADD CONSTRAINT "price_list_lines_priceListId_fkey" FOREIGN KEY ("priceListId") REFERENCES "price_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_list_lines" ADD CONSTRAINT "price_list_lines_factoryArticleId_fkey" FOREIGN KEY ("factoryArticleId") REFERENCES "factory_articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_order_lines" ADD CONSTRAINT "sales_order_lines_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "sales_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_order_lines" ADD CONSTRAINT "sales_order_lines_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "articles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_orders" ADD CONSTRAINT "service_orders_factoryId_fkey" FOREIGN KEY ("factoryId") REFERENCES "factories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_orders" ADD CONSTRAINT "service_orders_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "sales_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_order_lines" ADD CONSTRAINT "service_order_lines_serviceOrderId_fkey" FOREIGN KEY ("serviceOrderId") REFERENCES "service_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_order_lines" ADD CONSTRAINT "service_order_lines_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "articles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_order_lines" ADD CONSTRAINT "service_order_lines_salesOrderLineId_fkey" FOREIGN KEY ("salesOrderLineId") REFERENCES "sales_order_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_batches" ADD CONSTRAINT "verification_batches_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipt_verifications" ADD CONSTRAINT "receipt_verifications_serviceOrderId_fkey" FOREIGN KEY ("serviceOrderId") REFERENCES "service_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipt_verifications" ADD CONSTRAINT "receipt_verifications_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipt_verifications" ADD CONSTRAINT "receipt_verifications_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "verification_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_invoices" ADD CONSTRAINT "commission_invoices_factoryId_fkey" FOREIGN KEY ("factoryId") REFERENCES "factories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_invoice_lines" ADD CONSTRAINT "commission_invoice_lines_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "commission_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_invoice_service_orders" ADD CONSTRAINT "commission_invoice_service_orders_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "commission_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_invoice_service_orders" ADD CONSTRAINT "commission_invoice_service_orders_serviceOrderId_fkey" FOREIGN KEY ("serviceOrderId") REFERENCES "service_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
