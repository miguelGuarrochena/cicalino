CREATE TYPE "public"."business_type" AS ENUM('cafeteria', 'panaderia', 'rotiseria', 'heladeria', 'otro');--> statement-breakpoint
CREATE TYPE "public"."modo_identificacion" AS ENUM('pedido', 'nombre', 'mesa');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('creado', 'en_preparacion', 'listo', 'retirado', 'cancelado');--> statement-breakpoint
CREATE TYPE "public"."rol_usuario" AS ENUM('superadmin', 'admin', 'supervisor');--> statement-breakpoint
CREATE TABLE "empleados" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"local_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"rol" text,
	"pin" text,
	"activo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "locales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizacion_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"tipo_negocio" "business_type" DEFAULT 'otro' NOT NULL,
	"whatsapp" text,
	"direccion" text,
	"slug" text NOT NULL,
	"modo_identificacion" "modo_identificacion" DEFAULT 'pedido' NOT NULL,
	"cantidad_mesas" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizaciones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"responsable" text,
	"cuil" text,
	"direccion" text,
	"dueno_email" text NOT NULL,
	"cupo" integer DEFAULT 1 NOT NULL,
	"pagado" boolean DEFAULT true NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pedidos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"local_id" uuid NOT NULL,
	"referencia" text NOT NULL,
	"estado" "order_status" DEFAULT 'creado' NOT NULL,
	"empleado_id" uuid,
	"qr_token" text NOT NULL,
	"qr_expira_en" timestamp with time zone NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"en_preparacion_en" timestamp with time zone,
	"listo_en" timestamp with time zone,
	"retirado_en" timestamp with time zone,
	"cancelado_en" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pedido_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usuarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"nombre" text,
	"rol" "rol_usuario" DEFAULT 'admin' NOT NULL,
	"organizacion_id" uuid,
	"local_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "empleados" ADD CONSTRAINT "empleados_local_id_locales_id_fk" FOREIGN KEY ("local_id") REFERENCES "public"."locales"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "locales" ADD CONSTRAINT "locales_organizacion_id_organizaciones_id_fk" FOREIGN KEY ("organizacion_id") REFERENCES "public"."organizaciones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_local_id_locales_id_fk" FOREIGN KEY ("local_id") REFERENCES "public"."locales"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_empleado_id_empleados_id_fk" FOREIGN KEY ("empleado_id") REFERENCES "public"."empleados"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_pedido_id_pedidos_id_fk" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedidos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_organizacion_id_organizaciones_id_fk" FOREIGN KEY ("organizacion_id") REFERENCES "public"."organizaciones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_local_id_locales_id_fk" FOREIGN KEY ("local_id") REFERENCES "public"."locales"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_empleados_local" ON "empleados" USING btree ("local_id");--> statement-breakpoint
CREATE INDEX "idx_pedidos_local_estado" ON "pedidos" USING btree ("local_id","estado");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_pedidos_qr_token" ON "pedidos" USING btree ("qr_token");--> statement-breakpoint
CREATE INDEX "idx_pedidos_local_creado" ON "pedidos" USING btree ("local_id","creado_en");--> statement-breakpoint
CREATE INDEX "idx_push_pedido" ON "push_subscriptions" USING btree ("pedido_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_usuarios_email" ON "usuarios" USING btree ("email");