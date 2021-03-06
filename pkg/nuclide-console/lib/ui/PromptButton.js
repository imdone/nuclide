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

import invariant from 'assert';
import * as React from 'react';
import electron from 'electron';

const {remote} = electron;
invariant(remote != null);

type PromptOption = {
  id: string,
  label: string,
};

type Props = {
  value: string,
  onChange: (value: string) => void,
  children: ?any,
  options: Array<PromptOption>,
};

export default class PromptButton extends React.Component<Props> {
  _disposables: IDisposable;

  render(): React.Node {
    return (
      <span
        className="nuclide-console-prompt-wrapper"
        onClick={this._handleClick}>
        <span className="nuclide-console-prompt-label">
          {this.props.children}
        </span>
        <span className="icon icon-chevron-right" />
      </span>
    );
  }

  _handleClick = (event: SyntheticMouseEvent<>): void => {
    const currentWindow = remote.getCurrentWindow();
    const menu = new remote.Menu();
    // TODO: Sort alphabetically by label id:220 gh:221
    this.props.options.forEach(option => {
      menu.append(
        new remote.MenuItem({
          type: 'checkbox',
          checked: this.props.value === option.id,
          label: option.label,
          click: () => this.props.onChange(option.id),
        }),
      );
    });
    menu.popup(currentWindow, event.clientX, event.clientY);
  };
}
