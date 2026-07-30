"use client";

import { EmptyState } from "@/components/app/empty-state";
import { FreshnessIndicator } from "@/components/app/freshness-indicator";
import { MoneyText } from "@/components/app/money-text";
import { Providers } from "@/components/app/providers";
import { SeverityBadge } from "@/components/app/severity-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function KitchenSinkClient({ nonce }: { nonce?: string | undefined }) {
  return (
    <Providers nonce={nonce}>
      <main className="mx-auto max-w-4xl space-y-8 p-8" data-testid="kitchen-sink">
        <h1 className="text-2xl font-semibold">Kitchen sink</h1>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase text-muted-foreground">Buttons</h2>
          <div className="flex flex-wrap gap-2">
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Destructive</Button>
            <Button disabled>Disabled</Button>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase text-muted-foreground">Badges & severity</h2>
          <div className="flex flex-wrap gap-2">
            <Badge>Default</Badge>
            <Badge variant="secondary">Secondary</Badge>
            <Badge variant="muted">Muted</Badge>
            <SeverityBadge severity="high" />
            <SeverityBadge severity="medium" />
            <SeverityBadge severity="low" />
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase text-muted-foreground">Money</h2>
          <div className="flex flex-wrap gap-4">
            <MoneyText value="12345.6789" />
            <MoneyText value="-89.99" showDirection />
            <MoneyText value="123456.78" showDirection />
            <MoneyText value="12345678.90" compact />
            <MoneyText value="-1234.56" signConvention="accounting" />
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase text-muted-foreground">States (§03.5)</h2>
          <div className="grid grid-cols-2 gap-4">
            <Skeleton className="h-24" />
            <EmptyState variant="true-empty" title="Nothing here yet" description="One-line explanation." action={<Button size="sm">Primary action</Button>} />
            <EmptyState variant="filtered-empty" title="No matches" action={<Button size="sm" variant="outline">Clear filters</Button>} />
            <EmptyState variant="degraded" title="Partially degraded" description="Names what is degraded and what still works." />
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase text-muted-foreground">Freshness</h2>
          <div className="flex gap-4">
            <FreshnessIndicator computedAt={new Date().toISOString()} />
            <FreshnessIndicator computedAt={new Date(Date.now() - 30 * 3600_000).toISOString()} />
            <FreshnessIndicator computedAt={null} recomputing />
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase text-muted-foreground">Inputs</h2>
          <div className="flex max-w-md flex-col gap-2">
            <Input placeholder="Text input" />
            <div className="flex items-center gap-2">
              <Switch id="sink-switch" />
              <label htmlFor="sink-switch" className="text-sm">Switch</label>
            </div>
            <Tabs defaultValue="one">
              <TabsList>
                <TabsTrigger value="one">One</TabsTrigger>
                <TabsTrigger value="two">Two</TabsTrigger>
              </TabsList>
              <TabsContent value="one" className="hidden" />
              <TabsContent value="two" className="hidden" />
            </Tabs>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase text-muted-foreground">Cards</h2>
          <Card className="max-w-sm">
            <CardHeader>
              <CardTitle>Card title</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">Card body content.</CardContent>
          </Card>
        </section>
      </main>
    </Providers>
  );
}
