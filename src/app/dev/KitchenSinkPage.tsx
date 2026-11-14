import { Bell, Plus, Trash2 } from 'lucide-react';
import { motion } from 'motion/react';
import * as React from 'react';
import { toast } from 'sonner';
import {
  AiLabel, CodeBlock, EmptyState, ErrorState, LanguageSwitch, LevelBadge, ListSkeleton, Markdown, PageHeader, PostCard,
  PostCardSkeleton, ReasonChips, RelativeTime, Section, StatNumber, StatusBadge, TagChip, ThemeToggle, UserAvatar,
} from '@/components/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Drawer, DrawerBody, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle, DrawerTrigger } from '@/components/ui/drawer';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { SimpleTooltip } from '@/components/ui/tooltip';
import type { Author, Interest, Post } from '@/lib/api/contract';
import { RightRail } from '../layout';
import { useMotionPresets } from '../motion';

const js: Interest = { id: 1, slug: 'javascript', labelFr: 'JavaScript', labelEn: 'JavaScript' };
const react: Interest = { id: 3, slug: 'react', labelFr: 'React', labelEn: 'React' };
const career: Interest = { id: 15, slug: 'career', labelFr: 'Carrière', labelEn: 'Career' };
const sarah: Author = { id: 'ks-sarah', handle: 'sarah', displayName: 'Sarah Chen', avatarUrl: '/avatars/sarah.jpg', level: 'senior', reputation: 842 };
const noPhoto: Author = { id: 'ks-ines', handle: 'ines', displayName: 'Inès Diallo', avatarUrl: null, level: 'beginner', reputation: 12 };

const CODE = `function useDebounce(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    // relancé à chaque frappe
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);

  return debounced;
}

export default function Search() {
  const [query, setQuery] = useState('');
  const debounced = useDebounce(query, 250);
  useEffect(() => {
    fetch('/api/search?q=' + debounced);
  }, [debounced]);
  return <input value={query} onChange={(e) => setQuery(e.target.value)} />;
}`;

const post: Post = {
  id: 'ks-post-1', kind: 'problem', title: 'useEffect se déclenche deux fois en développement avec React 19',
  bodyMd: '', code: CODE, language: 'jsx', repro: null, difficulty: 'intermediate',
  aiSummary: 'Le double appel vient du StrictMode : l’effet doit être idempotent et nettoyer sa requête.',
  aiHints: [], status: 'solved', acceptedAnswerId: 'a1', author: sarah, circle: { id: 'c1', slug: 'react', name: 'React' },
  tags: [react, js], helpfulCount: 24, answerCount: 3, viewCount: 310, createdAt: new Date(Date.now() - 24 * 60_000).toISOString(),
  viewer: { helpful: false, saved: false },
  reasons: [{ kind: 'interest', interestSlug: 'react', count: 4 }, { kind: 'level' }],
};
const post2: Post = {
  ...post, id: 'ks-post-2', title: 'Comment négocier une première augmentation en tant que junior ?', code: null, language: null, aiSummary: null,
  status: 'open', author: noPhoto, circle: null, tags: [career], helpfulCount: 2, answerCount: 0, kind: 'discussion',
  createdAt: new Date(Date.now() - 5 * 3600_000).toISOString(), viewer: { helpful: true, saved: true },
  reasons: [{ kind: 'explore', interestSlug: 'career' }, { kind: 'unanswered' }],
};

const MD = `Le souci vient du **StrictMode** : en dev, React monte, démonte puis remonte le composant.

1. Rends l’effet *idempotent*
2. Annule la requête dans le nettoyage avec \`AbortController\`

\`\`\`js
useEffect(() => {
  const ctrl = new AbortController();
  fetch(url, { signal: ctrl.signal });
  return () => ctrl.abort();
}, [url]);
\`\`\`

> Voir la [doc React](https://react.dev/reference/react/StrictMode). <script>alert(1)</script> [lien piégé](javascript:alert(1))

| Mode | Appels |
|---|---|
| dev | 2 |
| prod | 1 |`;

export default function KitchenSinkPage() {
  const m = useMotionPresets();
  const [weight, setWeight] = React.useState([60]);
  const [palette, setPalette] = React.useState(false);

  return (
    <div className="flex flex-col gap-12">
      <PageHeader
        kicker="Design system"
        title="Kitchen sink"
        description="Tous les composants partagés et primitives, dans les deux thèmes."
        actions={
          <>
            <LanguageSwitch variant="segmented" />
            <ThemeToggle variant="segmented" />
          </>
        }
      />

      <Section title="Buttons">
        <div className="flex flex-wrap items-center gap-3">
          <Button><Plus aria-hidden="true" />Poser un problème</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="subtle">Subtle</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive"><Trash2 aria-hidden="true" />Supprimer</Button>
          <Button variant="link">Lien</Button>
          <Button loading>Envoi</Button>
          <Button disabled>Désactivé</Button>
          <Button size="sm">Small</Button>
          <Button size="lg">Large</Button>
          <SimpleTooltip label="Notifications">
            <Button variant="ghost" size="icon" aria-label="Notifications"><Bell aria-hidden="true" /></Button>
          </SimpleTooltip>
        </div>
      </Section>

      <Section title="Badges, chips, avatars">
        <div className="flex flex-wrap items-center gap-2.5">
          <LevelBadge level="beginner" /><LevelBadge level="intermediate" /><LevelBadge level="senior" />
          <StatusBadge status="open" /><StatusBadge status="solved" />
          <AiLabel /><AiLabel variant="short" />
          <TagChip tag={react} /><TagChip tag={js} to="/search?q=javascript" /><TagChip tag="actif" active onClick={() => undefined} />
          <Badge>Neutral</Badge><Badge variant="brand">Brand</Badge><Badge variant="solid">Solid</Badge><Badge variant="warning">Warning</Badge>
          <Badge variant="info">Info</Badge><Badge variant="violet">Violet</Badge><Badge variant="destructive">Danger</Badge>
        </div>
        <ReasonChips
          reasons={[
            { kind: 'interest', interestSlug: 'react', count: 4 }, { kind: 'level' }, { kind: 'trending', circleSlug: 'react' },
            { kind: 'explore', interestSlug: 'career' }, { kind: 'fresh' }, { kind: 'following' }, { kind: 'unanswered' },
          ]}
          tags={[react, career]}
          circleName="React"
        />
        <div className="flex flex-wrap items-center gap-3">
          {(['xs', 'sm', 'md', 'lg', 'xl'] as const).map((size) => <UserAvatar key={size} user={sarah} size={size} />)}
          {(['sm', 'md', 'lg', 'xl'] as const).map((size) => <UserAvatar key={size} user={noPhoto} size={size} />)}
          <UserAvatar user={{ displayName: 'Yann Kouamé', avatarUrl: null, id: 'x2' }} size="lg" />
          <span className="text-sm text-muted-foreground"><RelativeTime date={post.createdAt} /></span>
        </div>
      </Section>

      <Section title="Stats" description="StatNumber compte jusqu’à sa valeur à l’entrée dans l’écran.">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[['Débloqués cette semaine', 128], ['Membres', 2480], ['Problèmes', 1312], ['Résolus', 1004]].map(([label, value]) => (
            <Card key={label as string}>
              <CardContent className="!p-4">
                <StatNumber value={value as number} className="text-2xl font-medium" />
                <p className="mt-1 text-sm text-muted-foreground">{label}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </Section>

      <Section title="PostCard" description="Liste animée avec useMotionPresets().list / .item">
        <motion.div {...m.list} className="flex max-w-3xl flex-col gap-4">
          <motion.div variants={m.item}><PostCard post={post} showReasons /></motion.div>
          <motion.div variants={m.item}>
            <PostCard post={post2} showReasons footer={<p className="text-xs text-muted-foreground">Slot « footer »</p>} />
          </motion.div>
          <motion.div variants={m.item}><PostCardSkeleton withCode /></motion.div>
        </motion.div>
      </Section>

      <Section title="Markdown + CodeBlock">
        <div className="grid gap-6 lg:grid-cols-2">
          <Card><CardContent><Markdown>{MD}</Markdown></CardContent></Card>
          <div className="flex flex-col gap-4">
            <CodeBlock code={CODE} language="jsx" filename="useDebounce.jsx" maxLines={10} />
            <CodeBlock code={'SELECT id, title\nFROM posts\nWHERE status = \'open\' -- sans réponse\nLIMIT 10;'} language="sql" />
          </div>
        </div>
      </Section>

      <Section title="Forms">
        <div className="grid max-w-3xl gap-5 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="ks-title">Titre</Label>
            <Input id="ks-title" placeholder="Décris ton problème en une phrase" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="ks-level">Niveau</Label>
            <Select defaultValue="intermediate">
              <SelectTrigger id="ks-level"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="beginner">Débutant</SelectItem>
                <SelectItem value="intermediate">Intermédiaire</SelectItem>
                <SelectItem value="senior">Senior</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label htmlFor="ks-body">Détails</Label>
            <Textarea id="ks-body" placeholder="Ce que tu as essayé, ce que tu attendais…" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="ks-err">Champ invalide</Label>
            <Input id="ks-err" aria-invalid defaultValue="ab" aria-describedby="ks-err-msg" />
            <p id="ks-err-msg" className="text-sm text-destructive">8 caractères minimum.</p>
          </div>
          <div className="flex flex-col gap-3">
            <Label id="ks-slider">React dans mon fil : {weight[0]} %</Label>
            <Slider value={weight} onValueChange={setWeight} max={100} step={5} aria-labelledby="ks-slider" />
            <Progress value={weight[0]} aria-label="Poids" />
          </div>
          <div className="flex items-center gap-3">
            <Switch id="ks-switch" defaultChecked />
            <Label htmlFor="ks-switch">Masquer ce sujet</Label>
          </div>
          <ToggleGroup type="multiple" variant="outline" size="sm" defaultValue={['react']} aria-label="Centres d’intérêt">
            <ToggleGroupItem value="react">React</ToggleGroupItem>
            <ToggleGroupItem value="python">Python</ToggleGroupItem>
            <ToggleGroupItem value="devops">DevOps</ToggleGroupItem>
          </ToggleGroup>
        </div>
      </Section>

      <Section title="Tabs">
        <Tabs defaultValue="for-you" className="max-w-3xl">
          <TabsList>
            <TabsTrigger value="for-you">Pour toi</TabsTrigger>
            <TabsTrigger value="following">Abonnements</TabsTrigger>
            <TabsTrigger value="unanswered">Sans réponse</TabsTrigger>
            <TabsTrigger value="latest">Récents</TabsTrigger>
          </TabsList>
          <TabsContent value="for-you" className="text-sm text-muted-foreground">Indicateur partagé (layoutId) qui glisse entre les onglets.</TabsContent>
          <TabsContent value="following" className="text-sm text-muted-foreground">Abonnements</TabsContent>
          <TabsContent value="unanswered" className="text-sm text-muted-foreground">Sans réponse</TabsContent>
          <TabsContent value="latest" className="text-sm text-muted-foreground">Récents</TabsContent>
        </Tabs>
        <Tabs defaultValue="code" variant="pill">
          <TabsList>
            <TabsTrigger value="code">Code</TabsTrigger>
            <TabsTrigger value="preview">Aperçu</TabsTrigger>
            <TabsTrigger value="console">Console</TabsTrigger>
          </TabsList>
        </Tabs>
      </Section>

      <Section title="Overlays">
        <div className="flex flex-wrap gap-3">
          <Dialog>
            <DialogTrigger asChild><Button variant="secondary">Dialog</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Supprimer ce problème ?</DialogTitle>
                <DialogDescription>Les réponses seront supprimées avec lui. Cette action est définitive.</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="secondary">Annuler</Button>
                <Button variant="destructive">Supprimer</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Sheet>
            <SheetTrigger asChild><Button variant="secondary">Sheet</Button></SheetTrigger>
            <SheetContent>
              <SheetHeader><SheetTitle>Régler mon fil</SheetTitle><SheetDescription>Panneau latéral.</SheetDescription></SheetHeader>
            </SheetContent>
          </Sheet>
          <Drawer>
            <DrawerTrigger asChild><Button variant="secondary">Drawer</Button></DrawerTrigger>
            <DrawerContent>
              <DrawerHeader><DrawerTitle>Actions</DrawerTitle><DrawerDescription>Tiroir bas, glisser pour fermer.</DrawerDescription></DrawerHeader>
              <DrawerBody><Button className="w-full" variant="secondary">Moins de ce sujet</Button></DrawerBody>
            </DrawerContent>
          </Drawer>
          <Popover>
            <PopoverTrigger asChild><Button variant="secondary">Popover</Button></PopoverTrigger>
            <PopoverContent><p className="text-sm text-muted-foreground">Pourquoi je vois ça : tu as lu 4 problèmes React cette semaine.</p></PopoverContent>
          </Popover>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="secondary">Menu</Button></DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem>Modifier</DropdownMenuItem>
              <DropdownMenuItem>Signaler</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive"><Trash2 aria-hidden="true" />Supprimer</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="secondary" onClick={() => setPalette(true)}>Command</Button>
          <CommandDialog open={palette} onOpenChange={setPalette} title="Recherche">
            <CommandInput placeholder="Rechercher…" />
            <CommandList>
              <CommandEmpty>Aucun résultat.</CommandEmpty>
              <CommandGroup heading="Problèmes">
                <CommandItem>useEffect se déclenche deux fois</CommandItem>
                <CommandItem>Erreur CORS avec fetch</CommandItem>
              </CommandGroup>
            </CommandList>
          </CommandDialog>
          <Button variant="secondary" onClick={() => toast.success('Réponse publiée.', { description: 'Merci pour le coup de main.' })}>Toast</Button>
        </div>
      </Section>

      <Section title="States">
        <div className="grid gap-4 lg:grid-cols-2">
          <EmptyState title="Aucun problème sans réponse" description="Tout le monde est débloqué. Reviens plus tard." action={<Button variant="secondary">Voir le fil</Button>} />
          <ErrorState onRetry={() => undefined} />
          <Card>
            <CardHeader><CardTitle>Card</CardTitle><CardDescription>Filets fins plutôt qu’ombres.</CardDescription></CardHeader>
            <CardContent><ListSkeleton rows={3} /></CardContent>
            <CardFooter><Button size="sm" variant="secondary">Action</Button></CardFooter>
          </Card>
          <Card>
            <ScrollArea className="h-56">
              <div className="p-5 text-sm text-muted-foreground">
                {Array.from({ length: 14 }, (_, i) => (
                  <React.Fragment key={i}><p className="py-2">ScrollArea — ligne {i + 1}</p><Separator /></React.Fragment>
                ))}
              </div>
            </ScrollArea>
          </Card>
        </div>
      </Section>

      <RightRail>
        <Card>
          <CardHeader><p className="kicker">Right rail</p><CardTitle>Rempli avec &lt;RightRail&gt;</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground">Visible à partir de xl. La colonne n’existe que si une page la remplit.</CardContent>
        </Card>
      </RightRail>
    </div>
  );
}
