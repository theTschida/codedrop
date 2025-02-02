import React, { useEffect, useState, useCallback } from 'react';
import { makeStyles } from '@material-ui/styles';
import shortid from 'shortid';
import SidebarPanel from '../../components/SidebarPanel';
import EditorPanel from '../../components/EditorPanel';
import DropZone from '../../components/dnd/DropZone';
import TrashDropZone from '../../components/dnd/TrashDropZone';
import Row from '../../components/dnd/Row';
import {
  handleMoveWithinParent,
  handleMoveToDifferentParent,
  handleMoveSidebarComponentIntoParent,
  handleRemoveItemFromLayout,
} from '../../components/dnd/helpers';
import { SIDEBAR_ITEM, COLUMN } from '../../components/dnd/constants';

// query hooks
import { useQuery, useMutation } from '@apollo/client';
// graphql querires and mutations
import { PROJECT_QUERY } from '../../lib/apolloQueries';
import { PROJECT_MUTATION, ADD_COMPONENT } from '../../lib/apolloMutations';

const useStyles = makeStyles({
  body: {
    display: 'flex',
    flexDirection: 'row',
    flexGrow: 1,
  },
});

const Container = ({ projectId }) => {
  const classes = useStyles();
  const [previewMode, setPreviewMode] = useState(false);
  const [showEditor, setShowEditor] = useState(null);
  const [project, setProject] = useState({ layout: [], projectName: '', components: [] });

  // fetch the project from the db using graphql
  const {
    loading: loadingProject,
    error: loadingProjectError,
    data: projectDataGql,
  } = useQuery(PROJECT_QUERY, {
    fetchPolicy: 'network-only', // Used for first execution to ensure local data up to date with server
    variables: { id: projectId },
  });

  // when updateProject is invoked elsewhere in the application, it will trigger the PROJECT_MUTATION gql mutation
  const [updateProject, { data, loading, error }] = useMutation(PROJECT_MUTATION);
  // when addComponent is invoked elsewhere in the application, it will trigger the ADD_COMPONENT gql mutation
  const [addComponent] = useMutation(ADD_COMPONENT);

  useEffect(() => {
    if (loadingProject) return;
    const updatedProject = {
      ...projectDataGql.getProject,
      layout: JSON.parse(projectDataGql.getProject.layout),
    };
    setProject(updatedProject);
  }, [projectDataGql, loadingProject, data]);

  const { components, layout, projectName } = project;

  // helper function to remove item from the project layout
  const handleDropToTrashBin = useCallback(
    (dropZone, item) => {
      const splitItemPath = item.path.split('-');
      handleRemoveItemFromLayout(layout, splitItemPath, updateProject, projectId);
    },
    [layout, projectId, updateProject]
  );

  const handleDrop = useCallback(
    (dropZone, item) => {
      const splitDropZonePath = dropZone.path.split('-');
      const pathToDropZone = splitDropZonePath.slice(0, -1).join('-');

      const newItem = { id: item.id, type: item.type };
      if (item.type === COLUMN) {
        newItem.children = item.children;
      }

      // sidebar into
      if (item.type === SIDEBAR_ITEM) {
        // 1. Move sidebar item into page
        const newComponentId = shortid.generate();
        const newLayout = handleMoveSidebarComponentIntoParent(layout, splitDropZonePath, newComponentId);
        const newComponent = {
          variables: {
            component: {
              id: newComponentId,
              ...item.component,
              projects: {
                id: projectId,
                layout: JSON.stringify(newLayout),
                projectName,
              },
            },
          },
        };
        addComponent(newComponent);
        updateProject({
          variables: {
            project: {
              id: projectId,
              layout: JSON.stringify(newLayout),
            },
          },
        });
        return;
      }

      // move down here since sidebar items dont have path
      const splitItemPath = item.path.split('-');
      const pathToItem = splitItemPath.slice(0, -1).join('-');

      // 2. Pure move (no create)
      if (splitItemPath.length === splitDropZonePath.length) {
        // 2.a. move within parent
        if (pathToItem === pathToDropZone) {
          const newLayout = handleMoveWithinParent(layout, splitDropZonePath, splitItemPath);
          updateProject({
            variables: {
              project: {
                id: projectId.toString(),
                layout: JSON.stringify(newLayout),
              },
            },
          });
          return;
        }

        // 2.b. OR move different parent
        // TODO FIX columns. item includes children
        const newLayout = handleMoveToDifferentParent(
          layout,
          splitDropZonePath,
          splitItemPath,
          newItem
        );
        updateProject({
          variables: {
            project: {
              id: projectId.toString(),
              layout: JSON.stringify(newLayout),
            },
          },
        });
        return;
      }

      // 3. Move + Create
      const newLayout = handleMoveToDifferentParent(
        layout,
        splitDropZonePath,
        splitItemPath,
        newItem
      );
      updateProject({
        variables: {
          project: {
            id: projectId.toString(),
            layout: JSON.stringify(newLayout),
          },
        },
      });
    },
    [layout, addComponent, projectId, updateProject, projectName]
  );

  if (loadingProject) return 'Loading...';
  if (loadingProjectError) {
    return `Error! ${loadingProjectError?.message || ``}}`;
  }

  return (
    <div className={classes.body}>
      <SidebarPanel
        previewMode={previewMode}
        setPreviewMode={setPreviewMode}
        components={components}
        layout={layout}
      />
      <div className="pageContainer">
        <div className="page">
          {layout.map((row, index) => {
            const currentPath = `${index}`;

            return (
              <React.Fragment key={row.id}>
                <DropZone
                  data={{
                    path: currentPath,
                    childrenCount: layout.length,
                  }}
                  onDrop={handleDrop}
                  path={currentPath}
                />
                <Row
                  key={row.id}
                  data={row}
                  handleDrop={handleDrop}
                  components={components}
                  path={currentPath}
                  previewMode={previewMode}
                  setShowEditor={setShowEditor}
                />
              </React.Fragment>
            );
          })}
          <DropZone
            data={{
              path: `${layout.length}`,
              childrenCount: layout.length,
            }}
            onDrop={handleDrop}
            isLast
          />
        </div>

        <TrashDropZone
          data={{
            layout,
          }}
          onDrop={handleDropToTrashBin}
        />
      </div>
      {showEditor && (
        <EditorPanel
          project={project}
          component={showEditor}
          addComponent={addComponent}
          setShowEditor={setShowEditor}
        />
      )}
    </div>
  );
};

export async function getStaticPaths() {
  // not being used right now, but it is required so that getStaticProps works.
  // ideally, we will pull in a list of the projects here instead of having an empty array.
  const projects = [];

  return {
    fallback: 'blocking',
    paths: projects.map((project) => ({
      params: {
        projectId: project.projectId,
      },
    })),
  };
}

export async function getStaticProps(context) {
  // grab project ID from the url and pass in as a prop, prerender
  const projectId = context.params.projectId;
  return {
    props: {
      projectId,
    },
  };
}

export default Container;
