import { useState, useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faChevronDown, faChevronRight, faFolder, faFolderOpen,
  faFileCode, faFileLines,
} from '@fortawesome/free-solid-svg-icons';
import { faJsSquare, faReact, faPython, faHtml5, faCss3, faMarkdown } from '@fortawesome/free-brands-svg-icons';
import type { TreeNode } from '../types';

interface Props {
  root: TreeNode;
  activeFile: string | null;
  resultsByFile: Record<string, { violations: { length: number } | unknown[] }>;
  onFileOpen: (path: string) => void;
}

function fileIcon(lang?: string) {
  if (lang === 'javascript') return <FontAwesomeIcon icon={faJsSquare} className="text-yellow-400" />;
  if (lang === 'typescript') return <FontAwesomeIcon icon={faReact} className="text-blue-400" />;
  if (lang === 'python') return <FontAwesomeIcon icon={faPython} className="text-blue-300" />;
  if (lang === 'html') return <FontAwesomeIcon icon={faHtml5} className="text-orange-400" />;
  if (lang === 'css' || lang === 'scss' || lang === 'less') return <FontAwesomeIcon icon={faCss3} className="text-blue-500" />;
  if (lang === 'markdown') return <FontAwesomeIcon icon={faMarkdown} className="text-gray-400" />;
  if (lang === 'json' || lang === 'yaml' || lang === 'toml') return <FontAwesomeIcon icon={faFileCode} className="text-yellow-300" />;
  if (lang === 'plaintext') return <FontAwesomeIcon icon={faFileLines} className="text-gray-500" />;
  return <FontAwesomeIcon icon={faFileCode} className="text-gray-400" />;
}

interface NodeProps extends Props {
  node: TreeNode;
  level: number;
  expanded: Set<string>;
  onToggle: (path: string) => void;
}

function violationsCount(results: Props['resultsByFile'], path: string): number {
  const r = results[path];
  if (!r) return 0;
  const v = r.violations as unknown[];
  return Array.isArray(v) ? v.length : 0;
}

function TreeItem({ node, level, expanded, onToggle, activeFile, resultsByFile, onFileOpen, root }: NodeProps) {
  const isDir = node.type === 'directory';
  const isExpanded = expanded.has(node.path);
  const isActive = !isDir && activeFile === node.path;
  const count = !isDir ? violationsCount(resultsByFile, node.path) : 0;

  return (
    <div>
      <div
        onClick={() => isDir ? onToggle(node.path) : onFileOpen(node.path)}
        className={`group flex items-center cursor-pointer py-0.5 text-xs transition-colors ${
          isActive ? 'bg-blue-500/15 text-blue-300' : 'text-gray-400 hover:bg-[#21262d]'
        }`}
        style={{ paddingLeft: `${8 + level * 12}px`, paddingRight: '8px' }}
        title={node.path || node.name}
      >
        {isDir ? (
          <FontAwesomeIcon
            icon={isExpanded ? faChevronDown : faChevronRight}
            className="mr-1 text-[8px] text-gray-500 w-2"
          />
        ) : (
          <span className="mr-1 w-2 inline-block" />
        )}
        <span className="mr-1.5 w-3.5 text-center">
          {isDir
            ? <FontAwesomeIcon icon={isExpanded ? faFolderOpen : faFolder} className="text-blue-400 text-[11px]" />
            : fileIcon(node.language)}
        </span>
        <span className="truncate flex-1">{node.name}</span>
        {count > 0 && (
          <span className="text-[9px] text-orange-400 bg-orange-400/10 px-1 rounded ml-1">
            🤖 {count}
          </span>
        )}
      </div>
      {isDir && isExpanded && node.children && node.children.map(child => (
        <TreeItem
          key={child.path || child.name}
          node={child}
          level={level + 1}
          expanded={expanded}
          onToggle={onToggle}
          activeFile={activeFile}
          resultsByFile={resultsByFile}
          onFileOpen={onFileOpen}
          root={root}
        />
      ))}
    </div>
  );
}

export function FileTree(props: Props) {
  const { root } = props;
  // Expand root level dirs by default
  const initialExpanded = new Set<string>();
  initialExpanded.add(root.path); // root is always expanded (we show its children directly)
  if (root.children) {
    for (const c of root.children) {
      if (c.type === 'directory' && c.children && c.children.length <= 20) {
        initialExpanded.add(c.path);
      }
    }
  }
  const [expanded, setExpanded] = useState<Set<string>>(initialExpanded);

  const handleToggle = useCallback((path: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path); else next.add(path);
      return next;
    });
  }, []);

  return (
    <div className="select-none">
      {root.truncated && (
        <div className="px-2 py-1 mx-2 my-1 bg-yellow-500/10 border border-yellow-500/30 rounded text-[10px] text-yellow-400">
          ⚠️ Дерево обрезано: слишком много файлов
        </div>
      )}
      {root.children?.map(child => (
        <TreeItem
          key={child.path || child.name}
          node={child}
          level={0}
          expanded={expanded}
          onToggle={handleToggle}
          activeFile={props.activeFile}
          resultsByFile={props.resultsByFile}
          onFileOpen={props.onFileOpen}
          root={root}
        />
      ))}
    </div>
  );
}
