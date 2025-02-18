// @flow
import * as t from "@babel/types";

import type { TemplateReplacements } from "./options";
import type { Metadata, Placeholder } from "./parse";

export default function populatePlaceholders(
  metadata: Metadata,
  replacements: TemplateReplacements,
): BabelNodeFile {
  const ast = t.cloneNode(metadata.ast);

  if (replacements) {
    metadata.placeholders.forEach(placeholder => {
      if (
        !Object.prototype.hasOwnProperty.call(replacements, placeholder.name)
      ) {
        const placeholderName = placeholder.name;

        throw new Error(
          `Error: No substitution given for "${placeholderName}". If this is not meant to be a
            placeholder you may want to consider passing one of the following options to @babel/template:
            - { placeholderPattern: false, placeholderWhitelist: new Set(['${placeholderName}'])}
            - { placeholderPattern: /^${placeholderName}$/ }`,
        );
      }
    });
    Object.keys(replacements).forEach(key => {
      if (!metadata.placeholderNames.has(key)) {
        throw new Error(`Unknown substitution "${key}" given`);
      }
    });
  }

  // Process in reverse order to AST mutation doesn't change indices that
  // will be needed for later calls to `placeholder.resolve()`.
  metadata.placeholders
    .slice()
    .reverse()
    .forEach(placeholder => {
      try {
        applyReplacement(
          placeholder,
          ast,
          (replacements && replacements[placeholder.name]) || null,
        );
      } catch (e) {
        e.message = `@babel/template placeholder "${placeholder.name}": ${e.message}`;
        throw e;
      }
    });

  return ast;
}

function applyReplacement(
  placeholder: Placeholder,
  ast: BabelNodeFile,
  replacement: any,
) {
  // Track inserted nodes and clone them if they are inserted more than
  // once to avoid injecting the same node multiple times.
  if (placeholder.isDuplicate) {
    if (Array.isArray(replacement)) {
      replacement = replacement.map(node => t.cloneNode(node));
    } else if (typeof replacement === "object") {
      replacement = t.cloneNode(replacement);
    }
  }

  const { parent, key, index } = placeholder.resolve(ast);

  if (placeholder.type === "string") {
    if (typeof replacement === "string") {
      replacement = t.stringLiteral(replacement);
    }
    if (!replacement || !t.isStringLiteral(replacement)) {
      throw new Error("Expected string substitution");
    }
  } else if (placeholder.type === "statement") {
    if (index === undefined) {
      if (!replacement) {
        replacement = t.emptyStatement();
      } else if (Array.isArray(replacement)) {
        replacement = t.blockStatement(replacement);
      } else if (typeof replacement === "string") {
        replacement = t.expressionStatement(t.identifier(replacement));
      } else if (!t.isStatement(replacement)) {
        replacement = t.expressionStatement((replacement: any));
      }
    } else {
      if (replacement && !Array.isArray(replacement)) {
        if (typeof replacement === "string") {
          replacement = t.identifier(replacement);
        }
        if (!t.isStatement(replacement)) {
          replacement = t.expressionStatement((replacement: any));
        }
      }
    }
  } else if (placeholder.type === "param") {
    if (typeof replacement === "string") {
      replacement = t.identifier(replacement);
    }

    if (index === undefined) throw new Error("Assertion failure.");
  } else {
    if (typeof replacement === "string") {
      replacement = t.identifier(replacement);
    }
    if (Array.isArray(replacement)) {
      throw new Error("Cannot replace single expression with an array.");
    }
  }

  if (index === undefined) {
    t.validate(parent, key, replacement);

    (parent: any)[key] = replacement;
  } else {
    const items: Array<BabelNode> = (parent: any)[key].slice();

    if (placeholder.type === "statement" || placeholder.type === "param") {
      if (replacement == null) {
        items.splice(index, 1);
      } else if (Array.isArray(replacement)) {
        items.splice(index, 1, ...replacement);
      } else {
        items[index] = replacement;
      }
    } else {
      items[index] = replacement;
    }

    t.validate(parent, key, items);
    (parent: any)[key] = items;
  }
}
