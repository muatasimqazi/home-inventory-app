"use client";

import { notFound, useParams, useRouter } from "next/navigation";
import { Icon } from "@/components/icon";
import { ItemCard } from "@/components/item-card";
import { EmptyState } from "@/components/empty-state";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useInventoryStore } from "@/lib/store";
import { coverPhotoUrl } from "@/lib/cover-photo";
import { buildBreadcrumb, breadcrumbLabel, itemsForPerson } from "@/lib/selectors";
import { PERSON_RELATIONSHIP_LABEL } from "@/lib/types";

/**
 * A household member's profile (0031_item_sharing.sql) — one Person's
 * info plus the items that belong to them. What shows up in the item
 * grid is entirely a byproduct of what `items` already contains for the
 * current viewer: visiting your own profile shows every item you own
 * (private and shared alike), visiting anyone else's shows only the ones
 * they've shared with the household — see itemsForPerson()'s own comment.
 * No separate "can I see this" check needed here.
 */
export default function PersonProfilePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const people = useInventoryStore((s) => s.people);
  const items = useInventoryStore((s) => s.items);
  const locations = useInventoryStore((s) => s.locations);
  const containers = useInventoryStore((s) => s.containers);
  const currentUserId = useInventoryStore((s) => s.currentUserId);
  const members = useInventoryStore((s) => s.members);

  const person = people.find((p) => p.id === params.id);
  if (!person) return notFound();

  const isMe = person.linkedUserId === currentUserId;
  const member = person.linkedUserId ? members.find((m) => m.userId === person.linkedUserId) : undefined;
  const personItems = itemsForPerson(items, person.id);
  const sharedCount = personItems.filter((it) => it.isShared).length;
  const privateCount = personItems.length - sharedCount;

  return (
    <div className="flex flex-col gap-5 pb-6">
      <div className="flex items-center justify-between">
        <button onClick={() => router.back()} className="tap-target flex size-9 items-center justify-center rounded-full bg-white shadow-sm">
          <Icon name="arrowLeft" size={18} />
        </button>
        <h1 className="text-body font-medium text-ink">Profile</h1>
        <div className="size-9" />
      </div>

      <div className="flex items-center gap-3 rounded-2xl border border-border bg-white px-4 py-4 shadow-sm">
        <Avatar className="size-14">
          {person.avatarPath ? (
            <AvatarImage src={coverPhotoUrl(person.avatarPath)} alt="" />
          ) : (
            <AvatarFallback className="bg-brand-100 text-yellow text-item-title">{person.displayName.slice(0, 1).toUpperCase()}</AvatarFallback>
          )}
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-item-title font-semibold text-ink">
            {person.displayName} {isMe && <span className="text-caption font-normal text-muted-foreground">(you)</span>}
          </p>
          <p className="truncate text-caption text-muted-foreground">{member ? member.email : PERSON_RELATIONSHIP_LABEL[person.relationship]}</p>
        </div>
      </div>

      {/* Only meaningful once there's a mix to explain — a single-owner
          household or a profile with nothing private yet doesn't need the
          breakdown spelled out. */}
      {personItems.length > 0 && (isMe || sharedCount < personItems.length) && (
        <p className="text-caption text-muted-foreground">
          {isMe
            ? `${personItems.length} item${personItems.length === 1 ? "" : "s"} — ${sharedCount} shared with the household, ${privateCount} private`
            : `${sharedCount} item${sharedCount === 1 ? "" : "s"} shared with the household`}
        </p>
      )}

      {personItems.length === 0 ? (
        <EmptyState
          icon="user"
          title={isMe ? "Nothing filed under you yet" : "Nothing shared with you yet"}
          description={isMe ? "Items you own show up here once you set \"Belongs to\" on them." : `${person.displayName} hasn't shared any items with the household.`}
        />
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {personItems.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              breadcrumbLabel={breadcrumbLabel(buildBreadcrumb(item.locationId, item.containerId, locations, containers))}
            />
          ))}
        </div>
      )}
    </div>
  );
}
