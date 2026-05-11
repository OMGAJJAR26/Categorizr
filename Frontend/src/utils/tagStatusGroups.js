export const TAG_STATUS_GROUPS = [
  {
    key: "verification",
    heading: "Verification Status",
    options: [
      { key: "verified", label: "Verified" },
      { key: "unverified", label: "Unverified" },
    ],
  },
  {
    key: "reconciliation",
    heading: "Reconciliation Status",
    options: [
      { key: "reconciled", label: "Reconciled" },
      { key: "unreconciled", label: "Unreconciled" },
    ],
  },
  {
    key: "reimbursement",
    heading: "Reimbursement Status",
    options: [
      { key: "reimbursed", label: "Reimbursed" },
      { key: "unreimbursed", label: "Unreimbursed" },
    ],
  },
  {
    key: "warranty",
    heading: "Warranty Coverage",
    options: [
      { key: "warrantied", label: "Warrantied" },
      { key: "unwarrantied", label: "Not Warrantied" },
    ],
  },
  {
    key: "review",
    heading: "Review Status",
    options: [
      { key: "flagged", label: "Flagged" },
      { key: "unflagged", label: "Unflagged" },
    ],
  },
  {
    key: "priority",
    heading: "Priority Status",
    options: [
      { key: "starred", label: "Starred" },
      { key: "unstarred", label: "Unstarred" },
    ],
  },
  {
    key: "notification",
    heading: "Notification Status",
    options: [
      { key: "read", label: "Read" },
      { key: "unread", label: "Unread" },
    ],
  },
  {
    key: "access",
    heading: "Access Status",
    options: [
      { key: "locked", label: "Locked" },
      { key: "unlocked", label: "Unlocked" },
    ],
  },
  {
    key: "shared",
    heading: "Shared Status",
    options: [
      { key: "forwarded", label: "Forwarded" },
      { key: "received", label: "Received" },
    ],
  },
];

const groupOptionKeys = TAG_STATUS_GROUPS.flatMap((group) =>
  group.options.map((option) => option.key)
);
const groupOptionKeySet = new Set(groupOptionKeys);

export const getStatusGroupByKey = (groupKey) =>
  TAG_STATUS_GROUPS.find((group) => group.key === groupKey) || null;

export const getEffectiveGroupSelection = (selectedTags = [], group) => {
  const selectedInGroup = group.options
    .map((option) => option.key)
    .filter((optionKey) => selectedTags.includes(optionKey));

  if (selectedInGroup.length === 0) {
    return group.options.map((option) => option.key);
  }

  return selectedInGroup;
};

export const isGroupAllSelected = (selectedTags = [], group) =>
  getEffectiveGroupSelection(selectedTags, group).length ===
  group.options.length;

export const normalizeSelectedTags = (selectedTags = []) => {
  const selectedSet = new Set(selectedTags);
  const normalized = [];

  const unknownTags = selectedTags.filter((tag) => !groupOptionKeySet.has(tag));
  normalized.push(...unknownTags);

  TAG_STATUS_GROUPS.forEach((group) => {
    const optionKeys = group.options.map((option) => option.key);
    const selectedInGroup = optionKeys.filter((key) => selectedSet.has(key));

    if (selectedInGroup.length > 0 && selectedInGroup.length < optionKeys.length) {
      normalized.push(...selectedInGroup);
    }
  });

  return normalized;
};

export const setGroupToAll = (selectedTags = [], groupKey) => {
  const group = getStatusGroupByKey(groupKey);
  if (!group) return selectedTags;

  const optionKeys = new Set(group.options.map((option) => option.key));
  const nextTags = selectedTags.filter((tag) => !optionKeys.has(tag));
  return normalizeSelectedTags(nextTags);
};

export const toggleGroupOption = (selectedTags = [], groupKey, optionKey) => {
  const group = getStatusGroupByKey(groupKey);
  if (!group) return selectedTags;

  const optionKeys = new Set(group.options.map((option) => option.key));
  const baseTags = selectedTags.filter((tag) => !optionKeys.has(tag));
  const effectiveSelection = new Set(getEffectiveGroupSelection(selectedTags, group));

  if (effectiveSelection.has(optionKey)) {
    effectiveSelection.delete(optionKey);
  } else {
    effectiveSelection.add(optionKey);
  }

  const nextTags = [...baseTags, ...effectiveSelection];
  return normalizeSelectedTags(nextTags);
};

