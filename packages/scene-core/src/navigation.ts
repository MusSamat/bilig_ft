/**
 * Course-tree navigation & breadcrumbs (TZ W-04).
 *
 * "Хлебные крошки: предмет → раздел → тема. Иерархия любой глубины из модели
 * курса." The tree is data (CourseNode[]); no screen hard-codes depth.
 */
import type { CourseNode } from '@bilig/content-model';

export interface TreeNode extends CourseNode {
  children: TreeNode[];
}

/** Build the forest of course nodes for a subject, children ordered by `order`. */
export function buildTree(nodes: CourseNode[]): TreeNode[] {
  const byId = new Map<string, TreeNode>();
  for (const n of nodes) byId.set(n.id, { ...n, children: [] });

  const roots: TreeNode[] = [];
  for (const node of byId.values()) {
    if (node.parentId && byId.has(node.parentId)) {
      byId.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  const sort = (list: TreeNode[]): void => {
    list.sort((a, b) => a.order - b.order);
    list.forEach((c) => sort(c.children));
  };
  sort(roots);
  return roots;
}

/**
 * Breadcrumb path from the subject root down to `nodeId` (inclusive).
 * Returns [] if the node is unknown. Detects and breaks parent cycles.
 */
export function breadcrumbs(nodes: CourseNode[], nodeId: string): CourseNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const path: CourseNode[] = [];
  const seen = new Set<string>();
  let current = byId.get(nodeId);
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    path.unshift(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return byId.has(nodeId) ? path : [];
}

/** All leaf topics under a subtree (nodes carrying a topicId), in tree order. */
export function topicsUnder(nodes: CourseNode[], rootId: string): CourseNode[] {
  const tree = buildTree(nodes);
  const find = (list: TreeNode[]): TreeNode | undefined => {
    for (const n of list) {
      if (n.id === rootId) return n;
      const hit = find(n.children);
      if (hit) return hit;
    }
    return undefined;
  };
  const start = find(tree);
  if (!start) return [];
  const out: CourseNode[] = [];
  const walk = (n: TreeNode): void => {
    if (n.topicId) out.push(n);
    n.children.forEach(walk);
  };
  walk(start);
  return out;
}
