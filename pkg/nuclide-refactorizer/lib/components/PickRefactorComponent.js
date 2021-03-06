/**
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the license found in the LICENSE file in
 * the root directory of this source tree.
 *
 * @flow
 * @format
 */

import type {Store, PickPhase} from '../types';
import type {AvailableRefactoring} from '../..';

import * as React from 'react';
import * as Actions from '../refactorActions';
import {Button} from 'nuclide-commons-ui/Button';
import classNames from 'classnames';

type State = {
  selectedRefactoring: ?AvailableRefactoring,
};

export class PickRefactorComponent extends React.Component<
  {
    pickPhase: PickPhase,
    store: Store,
  },
  State,
> {
  state: State = {
    selectedRefactoring: null,
  };

  render(): React.Node {
    const {availableRefactorings} = this.props.pickPhase;
    if (availableRefactorings.length === 0) {
      return <div>No refactorings available at this location</div>;
    }

    const elements = availableRefactorings.map(r =>
      this._renderRefactorOption(r),
    );

    return (
      <div className="select-list nuclide-refactorizer-pick-refactor">
        <ol className="list-group">{elements}</ol>
      </div>
    );
  }

  _pickRefactor(refactoring: AvailableRefactoring): void {
    if (refactoring.kind === 'freeform' && refactoring.arguments.length === 0) {
      this.props.store.dispatch(
        Actions.execute(this.props.pickPhase.provider, {
          kind: 'freeform',
          editor: this.props.pickPhase.editor,
          originalRange: this.props.pickPhase.originalRange,
          id: refactoring.id,
          range: refactoring.range,
          arguments: new Map(),
        }),
      );
      return;
    }
    this.props.store.dispatch(Actions.pickedRefactor(refactoring));
  }

  _select(selectedRefactoring: AvailableRefactoring): void {
    this.setState({
      selectedRefactoring,
    });
  }

  _renderRefactorOption(refactoring: AvailableRefactoring): React.Node {
    switch (refactoring.kind) {
      case 'rename':
        return (
          <li>
            <Button
              // Used to identify this element in integration tests
              className="nuclide-refactorizer-pick-rename"
              onClick={() => {
                this._pickRefactor(refactoring);
              }}>
              Rename
            </Button>
          </li>
        );
      case 'freeform':
        const selectable = !refactoring.disabled;
        const selected =
          selectable && refactoring === this.state.selectedRefactoring;
        const props = {};
        props.className = classNames('two-lines', {
          'nuclide-refactorizer-selectable': selectable,
          'nuclide-refactorizer-selected': selected,
          'nuclide-refactorizer-unselectable': !selectable,
        });
        props.onMouseEnter = () => this._select(refactoring);
        if (!refactoring.disabled) {
          props.onClick = () => {
            this._pickRefactor(refactoring);
          };
        }
        const refactoringOption = (
          <li {...props}>
            <div
              className={classNames({
                'nuclide-refactorizer-selectable-text': selectable,
                'nuclide-refactorizer-selected-text': selected,
                'nuclide-refactorizer-unselectable-text': !selectable,
              })}>
              {refactoring.name}
            </div>
            <div
              className={classNames('text-smaller', {
                'nuclide-refactorizer-selectable-text': selectable,
                'nuclide-refactorizer-selected-text': selected,
                'nuclide-refactorizer-unselectable-text': !selectable,
              })}>
              {refactoring.description}
            </div>
          </li>
        );
        return refactoringOption;
      default:
        (refactoring.kind: empty);
        throw new Error(`Unknown refactoring kind ${refactoring.kind}`);
    }
  }
}
